package com.syncoraa.nativeapp.data

import com.syncoraa.nativeapp.model.AuthSession
import com.syncoraa.nativeapp.model.Company
import com.syncoraa.nativeapp.model.DashboardSummary
import com.syncoraa.nativeapp.model.Ledger
import com.syncoraa.nativeapp.model.LicenseInfo
import com.syncoraa.nativeapp.model.MonthlyBarPoint
import com.syncoraa.nativeapp.model.OutstandingBill
import com.syncoraa.nativeapp.model.PendingTransaction
import com.syncoraa.nativeapp.model.StockHistoryResult
import com.syncoraa.nativeapp.model.StockHistoryRow
import com.syncoraa.nativeapp.model.StockItem
import com.syncoraa.nativeapp.model.SyncHistoryEntry
import com.syncoraa.nativeapp.model.Voucher
import com.syncoraa.nativeapp.model.VoucherDetail
import com.syncoraa.nativeapp.model.VoucherLedgerEntry
import com.syncoraa.nativeapp.model.VoucherStockEntry
import com.syncoraa.nativeapp.util.LedgerCalculator
import com.syncoraa.nativeapp.util.LedgerPeriodResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.serializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.time.Instant
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.abs

class ApiException(
    message: String,
    val statusCode: Int = 0,
    val code: String? = null
) : IOException(message)

class SessionExpiredException(message: String = "Session expired. Please sign in again.") : IOException(message)

class SupabaseClient(
    baseUrl: String,
    private val anonKey: String,
    val sessionStore: SessionStorage,
    private val httpClient: OkHttpClient = defaultHttpClient()
) {
    private val baseUrl = baseUrl.trimEnd('/')
    private val refreshMutex = Mutex()

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    private fun enc(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    private fun escapeLikeExact(value: String): String =
        value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    // --- Authentication ---

    suspend fun signIn(email: String, password: String): AuthSession {
        val bodyJson = buildJsonObject {
            put("email", email.trim())
            put("password", password)
        }
        val req = Request.Builder()
            .url("$baseUrl/auth/v1/token?grant_type=password")
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .post(bodyJson.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        val responseBody = executeRaw(req)
        val session = parseAuthSession(responseBody)
            ?: throw ApiException("Login succeeded but no session token was returned.")
        sessionStore.saveSession(session)
        return session
    }

    suspend fun signUp(email: String, password: String, name: String): AuthSession? {
        val bodyJson = buildJsonObject {
            put("email", email.trim())
            put("password", password)
            put("data", buildJsonObject { put("name", name.trim()) })
        }
        val req = Request.Builder()
            .url("$baseUrl/auth/v1/signup")
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .post(bodyJson.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        val responseBody = executeRaw(req)
        val session = parseAuthSession(responseBody)
        if (session != null) {
            sessionStore.saveSession(session)
        }
        return session
    }

    suspend fun signOut() {
        val token = sessionStore.getSession()?.accessToken
        if (!token.isNullOrBlank()) {
            runCatching {
                val req = Request.Builder()
                    .url("$baseUrl/auth/v1/logout")
                    .header("apikey", anonKey)
                    .header("Authorization", "Bearer $token")
                    .post("".toRequestBody(JSON_MEDIA_TYPE))
                    .build()
                withContext(Dispatchers.IO) {
                    httpClient.newCall(req).execute().close()
                }
            }
        }
        sessionStore.clearSession()
        sessionStore.clearSelectedCompany()
    }

    private fun parseAuthSession(raw: String): AuthSession? {
        val root = json.parseToJsonElement(raw).jsonObject
        val accessToken = root["access_token"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
            ?: return null
        val refreshToken = root["refresh_token"]?.jsonPrimitive?.content.orEmpty()
        val expiresAt = root["expires_at"]?.jsonPrimitive?.longOrNull
            ?: (Instant.now().epochSecond + (root["expires_in"]?.jsonPrimitive?.longOrNull ?: 3600L))
        val userObj = root["user"]?.jsonObject
        val userId = userObj?.get("id")?.jsonPrimitive?.content.orEmpty()
        val email = userObj?.get("email")?.jsonPrimitive?.content.orEmpty()
        val metadata = userObj?.get("user_metadata") as? JsonObject
        val name = metadata?.get("name")?.jsonPrimitive?.content.orEmpty()
        return AuthSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtEpochSec = expiresAt,
            userId = userId,
            email = email,
            name = name
        )
    }

    private suspend fun ensureFreshToken(forceRefresh: Boolean = false): String {
        val current = sessionStore.getSession() ?: throw SessionExpiredException()
        val now = Instant.now().epochSecond
        val needsRefresh = forceRefresh ||
            (current.expiresAtEpochSec > 0L && now >= current.expiresAtEpochSec - 30L)
        if (!needsRefresh) return current.accessToken

        return refreshMutex.withLock {
            val latest = sessionStore.getSession() ?: throw SessionExpiredException()
            if (!forceRefresh && latest.expiresAtEpochSec > Instant.now().epochSecond + 30L) {
                return@withLock latest.accessToken
            }
            if (forceRefresh && latest.accessToken != current.accessToken) {
                return@withLock latest.accessToken
            }
            if (latest.refreshToken.isBlank()) {
                sessionStore.clearSession()
                throw SessionExpiredException()
            }

            val bodyJson = buildJsonObject { put("refresh_token", latest.refreshToken) }
            val req = Request.Builder()
                .url("$baseUrl/auth/v1/token?grant_type=refresh_token")
                .header("apikey", anonKey)
                .header("Content-Type", "application/json")
                .post(bodyJson.toString().toRequestBody(JSON_MEDIA_TYPE))
                .build()

            val result = withContext(Dispatchers.IO) {
                httpClient.newCall(req).execute().use { resp ->
                    resp.code to (resp.body?.string().orEmpty())
                }
            }
            val (code, text) = result
            if (code in 400..403) {
                sessionStore.clearSession()
                throw SessionExpiredException("Your session expired. Please sign in again.")
            }
            if (code !in 200..299) {
                throw ApiException(extractErrorMessage(text, "Session refresh failed ($code)"), code)
            }
            val refreshed = parseAuthSession(text)
                ?: throw SessionExpiredException()
            sessionStore.saveSession(refreshed)
            refreshed.accessToken
        }
    }

    // --- Authenticated REST / RPC transport ---

    private suspend fun executeRaw(request: Request): String = withContext(Dispatchers.IO) {
        httpClient.newCall(request).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw ApiException(
                    message = extractErrorMessage(body, "Request failed (${resp.code})"),
                    statusCode = resp.code,
                    code = extractErrorCode(body)
                )
            }
            body
        }
    }

    private suspend fun executeAuthenticated(
        method: String,
        pathAndQuery: String,
        body: String? = null,
        extraHeaders: Map<String, String> = emptyMap()
    ): Triple<Int, okhttp3.Headers, String> {
        var token = ensureFreshToken(forceRefresh = false)
        repeat(2) { attempt ->
            val reqBuilder = Request.Builder()
                .url("$baseUrl$pathAndQuery")
                .header("apikey", anonKey)
                .header("Authorization", "Bearer $token")
                .header("Accept", "application/json")

            extraHeaders.forEach { (k, v) -> reqBuilder.header(k, v) }

            when (method) {
                "GET" -> reqBuilder.get()
                "POST" -> reqBuilder.post((body ?: "{}").toRequestBody(JSON_MEDIA_TYPE))
                "PATCH" -> reqBuilder.patch((body ?: "{}").toRequestBody(JSON_MEDIA_TYPE))
                "DELETE" -> reqBuilder.delete()
                else -> error("Unsupported HTTP method: $method")
            }

            val (statusCode, headers, respBody) = withContext(Dispatchers.IO) {
                httpClient.newCall(reqBuilder.build()).execute().use { resp ->
                    Triple(resp.code, resp.headers, resp.body?.string().orEmpty())
                }
            }

            if (statusCode == 401 && attempt == 0) {
                token = ensureFreshToken(forceRefresh = true)
                return@repeat
            }

            if (statusCode !in 200..299 && statusCode != 416) {
                throw ApiException(
                    message = extractErrorMessage(respBody, "HTTP $statusCode error"),
                    statusCode = statusCode,
                    code = extractErrorCode(respBody)
                )
            }
            return Triple(statusCode, headers, respBody)
        }
        throw SessionExpiredException()
    }

    private fun extractErrorMessage(body: String, fallback: String): String {
        return runCatching {
            val obj = json.parseToJsonElement(body).jsonObject
            listOf("error_description", "msg", "message", "error", "hint")
                .firstNotNullOfOrNull { key ->
                    obj[key]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
                }
        }.getOrNull() ?: fallback
    }

    private fun extractErrorCode(body: String): String? {
        return runCatching {
            val obj = json.parseToJsonElement(body).jsonObject
            obj["code"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
        }.getOrNull()
    }

    suspend fun <T> readAllPages(
        pathAndQuery: String,
        deserializer: KSerializer<T>,
        pageSize: Int = 1000,
        maxRows: Int = 40_000
    ): List<T> {
        val listSerializer = ListSerializer(deserializer)
        val rows = mutableListOf<T>()
        var offset = 0
        while (rows.size < maxRows) {
            val end = offset + pageSize - 1
            val (code, _, body) = executeAuthenticated(
                method = "GET",
                pathAndQuery = pathAndQuery,
                extraHeaders = mapOf(
                    "Range" to "$offset-$end",
                    "Range-Unit" to "items"
                )
            )
            if (code == 416 || body.isBlank()) break
            val page = json.decodeFromString(listSerializer, body)
            rows.addAll(page)
            if (page.size < pageSize) break
            offset += pageSize
        }
        return if (rows.size > maxRows) rows.take(maxRows) else rows
    }

    private suspend inline fun <reified T> readAll(
        pathAndQuery: String,
        pageSize: Int = 1000,
        maxRows: Int = 40_000
    ): List<T> = readAllPages(pathAndQuery, json.serializersModule.serializer<T>(), pageSize, maxRows)

    suspend fun getExactCount(pathAndQuery: String): Int {
        val (code, headers, _) = executeAuthenticated(
            method = "GET",
            pathAndQuery = pathAndQuery,
            extraHeaders = mapOf(
                "Prefer" to "count=exact",
                "Range" to "0-0",
                "Range-Unit" to "items"
            )
        )
        val contentRange = headers["Content-Range"]
        if (!contentRange.isNullOrBlank()) {
            val totalPart = contentRange.substringAfter("/", "").trim()
            totalPart.toIntOrNull()?.let { return it }
        }
        if (code == 416) return 0
        return 0
    }

    // --- License ---

    suspend fun getLicenseStatus(): LicenseInfo {
        var lastError: Throwable? = null
        for (attempt in 0 until 3) {
            try {
                val (_, _, body) = executeAuthenticated(
                    method = "POST",
                    pathAndQuery = "/rest/v1/rpc/get_subscription_access",
                    body = "{}"
                )
                val parsed = json.decodeFromString<LicenseInfo>(body)
                val normalizedStatus = when {
                    !parsed.valid && (parsed.status == "active" || parsed.status == "trial") -> "unknown"
                    parsed.status == "no_license" -> "none"
                    parsed.status in setOf("active", "trial", "expired", "suspended", "blocked", "revoked") -> parsed.status
                    else -> "unknown"
                }
                return parsed.copy(status = normalizedStatus)
            } catch (err: ApiException) {
                lastError = err
                if (err.code in setOf("42501", "PGRST301", "PGRST302") || err.statusCode == 401) break
                if (attempt < 2) delay(500L * (attempt + 1))
            } catch (err: SessionExpiredException) {
                throw err
            } catch (err: Throwable) {
                lastError = err
                if (attempt < 2) delay(500L * (attempt + 1))
            }
        }
        throw lastError ?: ApiException("Could not verify license")
    }

    // --- Companies ---

    suspend fun listCompanies(): List<Company> {
        val (_, _, body) = executeAuthenticated(
            method = "GET",
            pathAndQuery = "/rest/v1/companies?select=*&order=name.asc"
        )
        return json.decodeFromString(ListSerializer(Company.serializer()), body)
    }

    suspend fun getLatestSyncTime(companyId: String): String? {
        val (_, _, body) = executeAuthenticated(
            method = "GET",
            pathAndQuery = "/rest/v1/sync_history?company_id=eq.${enc(companyId)}&status=in.(completed,success,successful)&completed_at=not.is.null&select=completed_at&order=completed_at.desc&limit=1"
        )
        val arr = json.parseToJsonElement(body) as? JsonArray ?: return null
        val first = arr.firstOrNull() as? JsonObject ?: return null
        return first["completed_at"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
    }

    // --- Dashboard ---

    suspend fun loadDashboard(
        company: Company,
        fromDate: String,
        toDate: String
    ): DashboardSummary = coroutineScope {
        val cid = company.id
        val vouchersDeferred = async {
            readAll<Voucher>(
                "/rest/v1/vouchers?company_id=eq.${enc(cid)}&is_deleted=eq.false" +
                    "&voucher_date=gte.${enc(fromDate)}&voucher_date=lte.${enc(toDate)}" +
                    "&select=id,company_id,voucher_type,voucher_number,voucher_date,party_name,total_amount,grand_total,guid" +
                    "&order=voucher_date.desc,id.asc"
            )
        }
        val ledgerCountDeferred = async {
            getExactCount("/rest/v1/ledgers?company_id=eq.${enc(cid)}&is_deleted=eq.false&select=id")
        }
        val voucherCountDeferred = async {
            getExactCount("/rest/v1/vouchers?company_id=eq.${enc(cid)}&is_deleted=eq.false&select=id")
        }
        val stockCountDeferred = async {
            getExactCount("/rest/v1/stock_items?company_id=eq.${enc(cid)}&select=id")
        }
        val pendingCountDeferred = async {
            getExactCount("/rest/v1/pending_transactions?company_id=eq.${enc(cid)}&status=eq.pending&select=id")
        }
        val outstandingsDeferred = async {
            runCatching { listOutstandings(cid) }.getOrDefault(emptyList())
        }
        val lastSyncDeferred = async {
            runCatching { getLatestSyncTime(cid) }.getOrNull() ?: company.lastSyncAt
        }

        val vouchers = vouchersDeferred.await()
        val outstandings = outstandingsDeferred.await()

        var totalSales = 0.0
        var totalPurchases = 0.0
        var totalReceipts = 0.0
        var totalPayments = 0.0
        val monthMap = sortedMapOf<String, Pair<Double, Double>>()

        for (v in vouchers) {
            val amt = v.effectiveAmount
            val typeLower = v.voucherType.lowercase(Locale.ENGLISH)
            val monthKey = v.voucherDate.take(7)
            when {
                typeLower.contains("sales") && !typeLower.contains("order") -> {
                    totalSales += amt
                    if (monthKey.length == 7) {
                        val cur = monthMap[monthKey] ?: (0.0 to 0.0)
                        monthMap[monthKey] = (cur.first + amt) to cur.second
                    }
                }
                typeLower.contains("purchase") && !typeLower.contains("order") -> {
                    totalPurchases += amt
                    if (monthKey.length == 7) {
                        val cur = monthMap[monthKey] ?: (0.0 to 0.0)
                        monthMap[monthKey] = cur.first to (cur.second + amt)
                    }
                }
                typeLower.contains("receipt") && !typeLower.contains("note") -> totalReceipts += amt
                typeLower.contains("payment") -> totalPayments += amt
            }
        }

        val totalReceivables = outstandings.filter { it.isReceivable }.sumOf { it.effectiveAmount }
        val totalPayables = outstandings.filter { !it.isReceivable }.sumOf { it.effectiveAmount }

        val monthlySeries = monthMap.entries.toList().takeLast(6).map { (key, pair) ->
            val monthNum = key.substringAfter("-", "").toIntOrNull()
            val label = if (monthNum != null && monthNum in 1..12) {
                Month.of(monthNum).getDisplayName(TextStyle.SHORT, Locale.ENGLISH)
            } else key
            MonthlyBarPoint(key, label, pair.first, pair.second)
        }

        DashboardSummary(
            totalSales = totalSales,
            totalPurchases = totalPurchases,
            totalReceipts = totalReceipts,
            totalPayments = totalPayments,
            totalReceivables = totalReceivables,
            totalPayables = totalPayables,
            ledgerCount = ledgerCountDeferred.await(),
            voucherCount = voucherCountDeferred.await(),
            stockCount = stockCountDeferred.await(),
            pendingQueueCount = pendingCountDeferred.await(),
            lastSyncAt = lastSyncDeferred.await(),
            monthlySeries = monthlySeries,
            recentVouchers = vouchers.take(10)
        )
    }

    // --- Ledgers & Statement ---

    suspend fun listLedgers(companyId: String): List<Ledger> =
        readAll(
            "/rest/v1/ledgers?company_id=eq.${enc(companyId)}&is_deleted=eq.false&select=*&order=name.asc,id.asc"
        )

    suspend fun loadLedgerStatement(
        companyId: String,
        ledger: Ledger,
        fromDate: String,
        toDate: String
    ): LedgerPeriodResult = coroutineScope {
        val exactName = escapeLikeExact(ledger.name)
        val entriesDeferred = async {
            readAll<VoucherLedgerEntry>(
                "/rest/v1/voucher_ledger_entries?company_id=eq.${enc(companyId)}&is_deleted=eq.false" +
                    "&ledger_name=ilike.${enc(exactName)}&select=id,voucher_id,ledger_name,amount,is_debit&order=id.asc"
            )
        }
        val primaryVouchersDeferred = async {
            readAll<Voucher>(
                "/rest/v1/vouchers?company_id=eq.${enc(companyId)}&is_deleted=eq.false" +
                    "&party_name=ilike.${enc(exactName)}&select=*&order=id.asc"
            )
        }

        val entries = entriesDeferred.await()
        val primary = primaryVouchersDeferred.await()
        val voucherMap = LinkedHashMap<String, Voucher>(primary.size)
        primary.forEach { voucherMap[it.id] = it }

        val linkedIds = entries.map { it.voucherId }.distinct().filter { it.isNotBlank() && !voucherMap.containsKey(it) }
        for (chunk in linkedIds.chunked(100)) {
            val inClause = chunk.joinToString(",") { enc(it) }
            val extra = readAll<Voucher>(
                "/rest/v1/vouchers?company_id=eq.${enc(companyId)}&is_deleted=eq.false&id=in.($inClause)&select=*&order=id.asc"
            )
            extra.forEach { voucherMap[it.id] = it }
        }

        val ordered = voucherMap.values.sortedWith(
            compareBy<Voucher>({ it.voucherDate.take(10) }, { it.id })
        )
        LedgerCalculator.calculateLedgerPeriod(
            vouchers = ordered,
            entries = entries,
            masterOpening = ledger.openingBalance,
            fromDate = fromDate,
            toDate = toDate,
            masterClosing = ledger.closingBalance ?: ledger.currentBalance
        )
    }

    // --- Vouchers & Details ---

    suspend fun listVouchers(
        companyId: String,
        fromDate: String,
        toDate: String,
        voucherType: String? = null
    ): List<Voucher> {
        val typeFilter = if (!voucherType.isNullOrBlank() && !voucherType.equals("All", ignoreCase = true)) {
            "&voucher_type=eq.${enc(voucherType)}"
        } else ""
        return readAll(
            "/rest/v1/vouchers?company_id=eq.${enc(companyId)}&is_deleted=eq.false" +
                "&voucher_date=gte.${enc(fromDate)}&voucher_date=lte.${enc(toDate)}" +
                "$typeFilter&select=*&order=voucher_date.desc,id.asc"
        )
    }

    suspend fun getVoucherDetail(voucherId: String): VoucherDetail = coroutineScope {
        val (_, _, bodyById) = executeAuthenticated(
            method = "GET",
            pathAndQuery = "/rest/v1/vouchers?id=eq.${enc(voucherId)}&select=*&limit=1"
        )
        var voucher = json.decodeFromString(ListSerializer(Voucher.serializer()), bodyById).firstOrNull()
        if (voucher == null) {
            val (_, _, bodyByVId) = executeAuthenticated(
                method = "GET",
                pathAndQuery = "/rest/v1/vouchers?voucher_id=eq.${enc(voucherId)}&select=*&limit=1"
            )
            voucher = json.decodeFromString(ListSerializer(Voucher.serializer()), bodyByVId).firstOrNull()
        }
        val resolved = voucher ?: throw ApiException("Voucher not found", 404)

        val lookupIds = listOfNotNull(resolved.id, resolved.voucherId, voucherId)
            .filter { it.isNotBlank() }
            .distinct()
        val inClause = lookupIds.joinToString(",") { enc(it) }

        val ledgerDeferred = async {
            val (_, _, raw) = executeAuthenticated(
                method = "GET",
                pathAndQuery = "/rest/v1/voucher_ledger_entries?is_deleted=eq.false&voucher_id=in.($inClause)&select=*"
            )
            json.decodeFromString(ListSerializer(VoucherLedgerEntry.serializer()), raw)
        }
        val stockDeferred = async {
            val (_, _, raw) = executeAuthenticated(
                method = "GET",
                pathAndQuery = "/rest/v1/voucher_stock_entries?is_deleted=eq.false&voucher_id=in.($inClause)&select=*"
            )
            json.decodeFromString(ListSerializer(VoucherStockEntry.serializer()), raw)
        }

        VoucherDetail(
            voucher = resolved,
            ledgerEntries = ledgerDeferred.await(),
            stockEntries = stockDeferred.await()
        )
    }

    // --- Stock Items & History ---

    suspend fun listStockItems(companyId: String): List<StockItem> =
        readAll<StockItem>(
            "/rest/v1/stock_items?company_id=eq.${enc(companyId)}&select=*&order=name.asc,id.asc"
        ).filter { it.isDeleted != true }

    suspend fun loadStockHistory(companyId: String, item: StockItem): StockHistoryResult {
        val exactName = escapeLikeExact(item.name)
        var entries = readAll<VoucherStockEntry>(
            "/rest/v1/voucher_stock_entries?company_id=eq.${enc(companyId)}&is_deleted=eq.false" +
                "&stock_item_name=eq.${enc(item.name)}&select=*&order=id.asc",
            maxRows = 5000
        )
        if (entries.isEmpty() && item.name.isNotBlank()) {
            entries = readAll<VoucherStockEntry>(
                "/rest/v1/voucher_stock_entries?company_id=eq.${enc(companyId)}&is_deleted=eq.false" +
                    "&stock_item_name=ilike.${enc("%$exactName%")}&select=*&order=id.asc",
                maxRows = 5000
            )
        }

        val voucherIds = entries.map { it.voucherId }.filter { it.isNotBlank() }.distinct()
        val voucherMap = HashMap<String, Voucher>()
        for (chunk in voucherIds.chunked(200)) {
            val inClause = chunk.joinToString(",") { enc(it) }
            val fetched = readAll<Voucher>(
                "/rest/v1/vouchers?company_id=eq.${enc(companyId)}&is_deleted=eq.false" +
                    "&id=in.($inClause)&select=id,voucher_number,voucher_type,voucher_date,party_name"
            )
            fetched.forEach { voucherMap[it.id] = it }
        }

        val opening = item.effectiveOpeningQty
        val normalized = entries.mapNotNull { entry ->
            val v = voucherMap[entry.voucherId] ?: return@mapNotNull null
            val qty = abs(entry.quantity ?: 0.0)
            val rate = abs(entry.rate ?: 0.0)
            val amt = abs(entry.amount ?: 0.0)
            val isInward = entry.isInward == true ||
                v.voucherType.equals("Purchase", ignoreCase = true) ||
                v.voucherType.equals("Purchase Invoice", ignoreCase = true) ||
                v.voucherType.equals("Credit Note", ignoreCase = true)
            StockHistoryRow(
                id = entry.id,
                voucherId = v.id,
                voucherDate = v.voucherDate,
                voucherType = v.voucherType,
                voucherNumber = v.voucherNumber.orEmpty(),
                partyName = v.partyName.orEmpty(),
                quantity = qty,
                rate = rate,
                amount = amt,
                isInward = isInward,
                runningStock = 0.0
            )
        }.sortedWith(compareBy<StockHistoryRow>({ it.voucherDate.take(10) }, { it.id }))

        var running = opening
        var inQty = 0.0
        var outQty = 0.0
        var inAmt = 0.0
        var outAmt = 0.0
        val ascWithRunning = normalized.map { row ->
            if (row.isInward) {
                running += row.quantity
                inQty += row.quantity
                inAmt += row.amount
            } else {
                running -= row.quantity
                outQty += row.quantity
                outAmt += row.amount
            }
            row.copy(runningStock = running)
        }

        return StockHistoryResult(
            item = item,
            rows = ascWithRunning.reversed(),
            openingQty = opening,
            totalInQty = inQty,
            totalOutQty = outQty,
            totalInAmount = inAmt,
            totalOutAmount = outAmt,
            closingQty = running
        )
    }

    // --- Outstandings ---

    suspend fun listOutstandings(companyId: String): List<OutstandingBill> {
        val bills = readAll<OutstandingBill>(
            "/rest/v1/outstanding_bills?company_id=eq.${enc(companyId)}&select=*&order=amount.desc"
        )
        if (bills.isNotEmpty()) return bills

        val ledgers = listLedgers(companyId)
        return ledgers.mapNotNull { ledger ->
            val groupLower = ledger.effectiveGroup.lowercase(Locale.ENGLISH)
            val bal = ledger.effectiveClosingBalance
            if (abs(bal) < 0.01) return@mapNotNull null
            when {
                groupLower.contains("debtor") -> OutstandingBill(
                    id = ledger.id,
                    companyId = companyId,
                    ledgerName = ledger.name,
                    direction = if (bal >= 0) "receivable" else "payable",
                    amount = abs(bal)
                )
                groupLower.contains("creditor") -> OutstandingBill(
                    id = ledger.id,
                    companyId = companyId,
                    ledgerName = ledger.name,
                    direction = if (bal <= 0) "payable" else "receivable",
                    amount = abs(bal)
                )
                else -> null
            }
        }.sortedByDescending { it.effectiveAmount }
    }

    // --- Sync History & Pending Push Queue ---

    suspend fun listSyncHistory(companyId: String): List<SyncHistoryEntry> {
        val (_, _, body) = executeAuthenticated(
            method = "GET",
            pathAndQuery = "/rest/v1/sync_history?company_id=eq.${enc(companyId)}&select=*&order=started_at.desc&limit=20"
        )
        return json.decodeFromString(ListSerializer(SyncHistoryEntry.serializer()), body)
    }

    suspend fun listPendingTransactions(companyId: String): List<PendingTransaction> {
        val (_, _, body) = executeAuthenticated(
            method = "GET",
            pathAndQuery = "/rest/v1/pending_transactions?company_id=eq.${enc(companyId)}&select=id,company_id,transaction_type,status,error_message,tally_voucher_number,created_at,synced_at,voucher_data&order=created_at.desc&limit=200"
        )
        return json.decodeFromString(ListSerializer(PendingTransaction.serializer()), body)
    }

    suspend fun queueCreateVoucher(
        companyId: String,
        transactionType: String,
        voucherData: JsonObject
    ): PendingTransaction {
        val userId = sessionStore.getSession()?.userId
        val normalizedMap = voucherData.toMutableMap()
        if (!normalizedMap.containsKey("voucher_type_name")) {
            normalizedMap["voucher_type_name"] = JsonPrimitive(transactionType)
        }
        if (!normalizedMap.containsKey("voucher_type")) {
            normalizedMap["voucher_type"] = JsonPrimitive(transactionType)
        }
        val dateVal = normalizedMap["voucher_date"] ?: normalizedMap["date"]
        if (dateVal != null && !normalizedMap.containsKey("voucher_date")) {
            normalizedMap["voucher_date"] = dateVal
        }
        if (dateVal != null && !normalizedMap.containsKey("invoice_date")) {
            normalizedMap["invoice_date"] = dateVal
        }

        val payload = buildJsonObject {
            put("company_id", companyId.trim())
            put("transaction_type", transactionType.ifBlank { "Vouchers" })
            put("voucher_data", JsonObject(normalizedMap))
            put("status", "pending")
            if (!userId.isNullOrBlank()) put("created_by", userId)
            put("created_at", Instant.now().toString())
        }

        val (_, _, body) = executeAuthenticated(
            method = "POST",
            pathAndQuery = "/rest/v1/pending_transactions",
            body = payload.toString(),
            extraHeaders = mapOf(
                "Content-Type" to "application/json",
                "Prefer" to "return=representation"
            )
        )
        return json.decodeFromString(ListSerializer(PendingTransaction.serializer()), body).first()
    }

    suspend fun queueDeleteVoucher(companyId: String, voucher: Voucher): PendingTransaction {
        val voucherData = buildJsonObject {
            put("voucher_type_name", voucher.voucherType)
            put("voucher_number", voucher.voucherNumber.orEmpty())
            put("voucher_date", voucher.voucherDate)
            put("tally_guid", voucher.guid.orEmpty())
            put("tally_master_id", voucher.masterId.orEmpty())
            put("party_name", voucher.partyName.orEmpty())
        }
        val payload = buildJsonObject {
            put("company_id", companyId.trim())
            put("transaction_type", "VOUCHER_DELETE")
            put("status", "pending")
            put("voucher_data", voucherData)
        }

        val (_, _, body) = executeAuthenticated(
            method = "POST",
            pathAndQuery = "/rest/v1/pending_transactions",
            body = payload.toString(),
            extraHeaders = mapOf(
                "Content-Type" to "application/json",
                "Prefer" to "return=representation"
            )
        )
        return json.decodeFromString(ListSerializer(PendingTransaction.serializer()), body).first()
    }

    suspend fun retryFailedTransaction(companyId: String, txId: String): Boolean {
        val payload = buildJsonObject {
            put("status", "pending")
            put("error_message", null as String?)
        }
        val (_, _, body) = executeAuthenticated(
            method = "PATCH",
            pathAndQuery = "/rest/v1/pending_transactions?id=eq.${enc(txId)}&company_id=eq.${enc(companyId)}&status=eq.failed&select=id",
            body = payload.toString(),
            extraHeaders = mapOf(
                "Content-Type" to "application/json",
                "Prefer" to "return=representation"
            )
        )
        val arr = runCatching { json.parseToJsonElement(body) as? JsonArray }.getOrNull()
        return arr != null && arr.isNotEmpty()
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}
