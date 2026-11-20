package com.syncoraa.nativeapp

import com.syncoraa.nativeapp.data.SessionStorage
import com.syncoraa.nativeapp.data.SupabaseClient
import com.syncoraa.nativeapp.model.AuthSession
import com.syncoraa.nativeapp.model.Company
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

class SupabaseClientTest {
    private lateinit var server: MockWebServer
    private lateinit var store: InMemorySessionStore
    private lateinit var client: SupabaseClient

    private class InMemorySessionStore : SessionStorage {
        private var session: AuthSession? = null
        private var companyId: String? = null
        private var companyName: String? = null
        private var darkMode: String = "system"

        override fun getSession(): AuthSession? = session
        override fun saveSession(session: AuthSession) { this.session = session }
        override fun clearSession() { session = null }
        override fun getSelectedCompanyId(): String? = companyId
        override fun getSelectedCompanyName(): String? = companyName
        override fun saveSelectedCompany(id: String, name: String) {
            companyId = id
            companyName = name
        }
        override fun clearSelectedCompany() {
            companyId = null
            companyName = null
        }
        override fun getDarkMode(): String = darkMode
        override fun setDarkMode(mode: String) { darkMode = mode }
    }

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        store = InMemorySessionStore()
        client = SupabaseClient(
            baseUrl = server.url("/").toString().trimEnd('/'),
            anonKey = "test-anon-key",
            sessionStore = store
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun signInParsesAndPersistsSession() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "access_token": "acc-123",
                      "refresh_token": "ref-456",
                      "expires_in": 3600,
                      "user": {
                        "id": "user-1",
                        "email": "owner@syncora.test",
                        "user_metadata": { "name": "Test Owner" }
                      }
                    }
                    """.trimIndent()
                )
        )

        val session = client.signIn("owner@syncora.test", "secret123")
        assertEquals("acc-123", session.accessToken)
        assertEquals("ref-456", session.refreshToken)
        assertEquals("user-1", session.userId)
        assertEquals("owner@syncora.test", session.email)
        assertEquals(session, store.getSession())
    }

    @Test
    fun unauthorizedRequestRefreshesTokenOnceAndRetries() = runBlocking {
        store.saveSession(
            AuthSession(
                accessToken = "old-token",
                refreshToken = "refresh-1",
                expiresAtEpochSec = Instant.now().epochSecond + 3600L,
                userId = "user-1",
                email = "owner@syncora.test"
            )
        )

        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"message":"JWT expired"}"""))
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """
                {
                  "access_token": "fresh-token",
                  "refresh_token": "refresh-2",
                  "expires_in": 3600,
                  "user": { "id": "user-1", "email": "owner@syncora.test" }
                }
                """.trimIndent()
            )
        )
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """[{"id":"c1","name":"Acme Pvt Ltd"}]"""
            )
        )

        val companies = client.listCompanies()
        assertEquals(1, companies.size)
        assertEquals("Acme Pvt Ltd", companies.first().name)
        assertEquals("fresh-token", store.getSession()?.accessToken)

        val firstReq = server.takeRequest()
        assertEquals("Bearer old-token", firstReq.getHeader("Authorization"))
        val refreshReq = server.takeRequest()
        assertEquals("/auth/v1/token?grant_type=refresh_token", refreshReq.path)
        val retryReq = server.takeRequest()
        assertEquals("Bearer fresh-token", retryReq.getHeader("Authorization"))
    }

    @Test
    fun readAllPagesMergesFullPageAndTrailingShortPage() = runBlocking {
        store.saveSession(
            AuthSession(
                accessToken = "tok-1",
                refreshToken = "ref-1",
                expiresAtEpochSec = Instant.now().epochSecond + 3600L,
                userId = "u1",
                email = "u@test.com"
            )
        )

        val firstPage = (1..1000).joinToString(",", prefix = "[", postfix = "]") { idx ->
            """{"id":"c$idx","name":"Company $idx"}"""
        }
        val secondPage = """[{"id":"c1001","name":"Company 1001"}]"""

        server.enqueue(MockResponse().setResponseCode(200).setBody(firstPage))
        server.enqueue(MockResponse().setResponseCode(200).setBody(secondPage))

        val merged = client.readAllPages("/rest/v1/companies?select=id,name", Company.serializer(), pageSize = 1000)
        assertEquals(1001, merged.size)
        assertEquals("Company 1", merged.first().name)
        assertEquals("Company 1001", merged.last().name)

        val req1 = server.takeRequest()
        val req2 = server.takeRequest()
        assertEquals("0-999", req1.getHeader("Range"))
        assertEquals("1000-1999", req2.getHeader("Range"))
    }

    @Test
    fun getLicenseStatusCallsRpcAndNormalizesResponse() = runBlocking {
        store.saveSession(
            AuthSession(
                accessToken = "tok-1",
                refreshToken = "ref-1",
                expiresAtEpochSec = Instant.now().epochSecond + 3600L,
                userId = "u1",
                email = "u@test.com"
            )
        )

        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"valid":true,"status":"trial","plan_name":"Free Trial","plan_slug":"trial","days_left":6,"is_admin":false}"""
            )
        )
        val trial = client.getLicenseStatus()
        assertTrue(trial.isActiveOrTrial)
        assertEquals("trial", trial.status)
        assertEquals(6, trial.daysLeft)
        val rpcReq = server.takeRequest()
        assertEquals("/rest/v1/rpc/get_subscription_access", rpcReq.path)

        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"valid":false,"status":"no_license","plan_name":"None","days_left":0}"""
            )
        )
        val noLic = client.getLicenseStatus()
        assertEquals("none", noLic.status)
    }

    @Test
    fun queueCreateVoucherPostsExactPendingTransactionsPayload() = runBlocking {
        store.saveSession(
            AuthSession(
                accessToken = "tok-1",
                refreshToken = "ref-1",
                expiresAtEpochSec = Instant.now().epochSecond + 3600L,
                userId = "user-99",
                email = "u@test.com"
            )
        )

        server.enqueue(
            MockResponse().setResponseCode(201).setBody(
                """[{"id":"tx-1","company_id":"comp-1","transaction_type":"Sales","status":"pending","voucher_data":{"voucher_type_name":"Sales","voucher_date":"2026-11-20"}}]"""
            )
        )

        val tx = client.queueCreateVoucher(
            companyId = "comp-1",
            transactionType = "Sales",
            voucherData = buildJsonObject {
                put("voucher_date", "2026-11-20")
                put("party_name", "Bharat Traders")
                put("grand_total", 1180.0)
            }
        )

        assertEquals("tx-1", tx.id)
        assertEquals("pending", tx.status)

        val recorded = server.takeRequest()
        assertEquals("/rest/v1/pending_transactions", recorded.path)
        val posted = Json.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("comp-1", posted["company_id"]?.jsonPrimitive?.content)
        assertEquals("Sales", posted["transaction_type"]?.jsonPrimitive?.content)
        assertEquals("pending", posted["status"]?.jsonPrimitive?.content)
        assertEquals("user-99", posted["created_by"]?.jsonPrimitive?.content)
        val vData = posted["voucher_data"]!!.jsonObject
        assertEquals("Sales", vData["voucher_type_name"]?.jsonPrimitive?.content)
        assertEquals("2026-11-20", vData["voucher_date"]?.jsonPrimitive?.content)
        assertEquals("2026-11-20", vData["invoice_date"]?.jsonPrimitive?.content)
    }
}
