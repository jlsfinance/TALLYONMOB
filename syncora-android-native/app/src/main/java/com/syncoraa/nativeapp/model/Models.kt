package com.syncoraa.nativeapp.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlin.math.abs

object FlexibleDoubleSerializer : KSerializer<Double?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleDouble", PrimitiveKind.DOUBLE)

    override fun deserialize(decoder: Decoder): Double? {
        val jsonDecoder = decoder as? JsonDecoder
            ?: return runCatching { decoder.decodeDouble() }.getOrNull()
        val element = jsonDecoder.decodeJsonElement()
        if (element is JsonNull) return null
        val primitive = element as? JsonPrimitive ?: return null
        primitive.doubleOrNull?.let { return it }
        val text = primitive.content.trim().replace(",", "")
        return text.toDoubleOrNull()
    }

    override fun serialize(encoder: Encoder, value: Double?) {
        if (value == null) encoder.encodeNull() else encoder.encodeDouble(value)
    }
}

object FlexibleIntSerializer : KSerializer<Int> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleInt", PrimitiveKind.INT)

    override fun deserialize(decoder: Decoder): Int {
        val jsonDecoder = decoder as? JsonDecoder
            ?: return runCatching { decoder.decodeInt() }.getOrDefault(0)
        val element = jsonDecoder.decodeJsonElement()
        if (element is JsonNull) return 0
        val primitive = element as? JsonPrimitive ?: return 0
        primitive.intOrNull?.let { return it }
        return primitive.content.trim().toDoubleOrNull()?.toInt() ?: 0
    }

    override fun serialize(encoder: Encoder, value: Int) {
        encoder.encodeInt(value)
    }
}

object FlexibleBooleanSerializer : KSerializer<Boolean?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleBoolean", PrimitiveKind.BOOLEAN)

    override fun deserialize(decoder: Decoder): Boolean? {
        val jsonDecoder = decoder as? JsonDecoder
            ?: return runCatching { decoder.decodeBoolean() }.getOrNull()
        val element = jsonDecoder.decodeJsonElement()
        if (element is JsonNull) return null
        val primitive = element as? JsonPrimitive ?: return null
        primitive.booleanOrNull?.let { return it }
        return when (primitive.content.trim().lowercase()) {
            "true", "1", "yes" -> true
            "false", "0", "no" -> false
            else -> null
        }
    }

    override fun serialize(encoder: Encoder, value: Boolean?) {
        if (value == null) encoder.encodeNull() else encoder.encodeBoolean(value)
    }
}

@Serializable
data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSec: Long,
    val userId: String,
    val email: String,
    val name: String = ""
)

@Serializable
data class LicenseInfo(
    val valid: Boolean = false,
    val status: String = "none",
    @SerialName("plan_name") val planName: String = "None",
    @SerialName("plan_slug") val planSlug: String = "",
    @SerialName("expiry_date") val expiryDate: String = "",
    @Serializable(with = FlexibleIntSerializer::class)
    @SerialName("days_left") val daysLeft: Int = 0,
    @SerialName("is_admin") val isAdmin: Boolean = false
) {
    val isActiveOrTrial: Boolean
        get() = valid && (status == "active" || status == "trial")
}

@Serializable
data class Company(
    val id: String = "",
    val name: String = "",
    val gstin: String? = null,
    val address: String? = null,
    val state: String? = null,
    val phone: String? = null,
    val email: String? = null,
    @SerialName("last_sync_at") val lastSyncAt: String? = null,
    @SerialName("connector_version") val connectorVersion: String? = null
)

@Serializable
data class Ledger(
    val id: String = "",
    @SerialName("company_id") val companyId: String = "",
    val name: String = "",
    val parent: String? = null,
    @SerialName("parent_group") val parentGroup: String? = null,
    @SerialName("ledger_type") val ledgerType: String? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("opening_balance") val openingBalance: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("current_balance") val currentBalance: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("closing_balance") val closingBalance: Double? = null,
    val gstin: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val pan: String? = null,
    val address: String? = null
) {
    val effectiveGroup: String
        get() = parent?.takeIf { it.isNotBlank() }
            ?: parentGroup?.takeIf { it.isNotBlank() }
            ?: ledgerType?.takeIf { it.isNotBlank() }
            ?: "Other"

    val effectiveClosingBalance: Double
        get() = closingBalance ?: currentBalance ?: openingBalance ?: 0.0
}

@Serializable
data class Voucher(
    val id: String = "",
    @SerialName("voucher_id") val voucherId: String? = null,
    @SerialName("company_id") val companyId: String = "",
    @SerialName("voucher_type") val voucherType: String = "",
    @SerialName("voucher_number") val voucherNumber: String? = null,
    @SerialName("voucher_date") val voucherDate: String = "",
    @SerialName("party_name") val partyName: String? = null,
    val narration: String? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("total_amount") val totalAmount: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("grand_total") val grandTotal: Double? = null,
    val guid: String? = null,
    @SerialName("master_id") val masterId: String? = null,
    @SerialName("alter_id") val alterId: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class)
    @SerialName("is_deleted") val isDeleted: Boolean? = null
) {
    val effectiveAmount: Double
        get() = abs(grandTotal?.takeIf { it != 0.0 } ?: totalAmount ?: 0.0)
}

@Serializable
data class VoucherLedgerEntry(
    val id: String = "",
    @SerialName("voucher_id") val voucherId: String = "",
    @SerialName("ledger_name") val ledgerName: String = "",
    @Serializable(with = FlexibleDoubleSerializer::class)
    val amount: Double? = null,
    @Serializable(with = FlexibleBooleanSerializer::class)
    @SerialName("is_debit") val isDebit: Boolean? = null
)

@Serializable
data class VoucherStockEntry(
    val id: String = "",
    @SerialName("voucher_id") val voucherId: String = "",
    @SerialName("stock_item_name") val stockItemName: String = "",
    @Serializable(with = FlexibleDoubleSerializer::class)
    val quantity: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    val rate: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    val amount: Double? = null,
    @Serializable(with = FlexibleBooleanSerializer::class)
    @SerialName("is_inward") val isInward: Boolean? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("tax_rate") val taxRate: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("gst_rate") val gstRate: Double? = null,
    val unit: String? = null
) {
    val effectiveTaxRate: Double
        get() = taxRate ?: gstRate ?: 0.0
}

data class VoucherDetail(
    val voucher: Voucher,
    val ledgerEntries: List<VoucherLedgerEntry>,
    val stockEntries: List<VoucherStockEntry>
)

@Serializable
data class StockItem(
    val id: String = "",
    @SerialName("company_id") val companyId: String = "",
    val name: String = "",
    @SerialName("stock_group") val stockGroup: String? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("current_stock") val currentStock: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("opening_stock") val openingStock: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("opening_balance") val openingBalance: Double? = null,
    val unit: String? = null,
    @SerialName("base_unit") val baseUnit: String? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("closing_value") val closingValue: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    val rate: Double? = null,
    @Serializable(with = FlexibleDoubleSerializer::class)
    @SerialName("gst_rate") val gstRate: Double? = null,
    @SerialName("hsn_code") val hsnCode: String? = null,
    @Serializable(with = FlexibleBooleanSerializer::class)
    @SerialName("is_deleted") val isDeleted: Boolean? = null
) {
    val effectiveUnit: String
        get() = unit?.takeIf { it.isNotBlank() } ?: baseUnit?.takeIf { it.isNotBlank() } ?: "Nos"

    val effectiveOpeningQty: Double
        get() = openingStock ?: openingBalance ?: 0.0

    val effectiveCurrentQty: Double
        get() = currentStock ?: effectiveOpeningQty

    val effectiveRate: Double
        get() {
            val direct = rate ?: 0.0
            if (direct > 0.0) return direct
            val qty = abs(effectiveCurrentQty)
            val value = abs(closingValue ?: 0.0)
            return if (qty > 0.0 && value > 0.0) value / qty else 0.0
        }
}

data class StockHistoryRow(
    val id: String,
    val voucherId: String,
    val voucherDate: String,
    val voucherType: String,
    val voucherNumber: String,
    val partyName: String,
    val quantity: Double,
    val rate: Double,
    val amount: Double,
    val isInward: Boolean,
    val runningStock: Double
)

data class StockHistoryResult(
    val item: StockItem,
    val rows: List<StockHistoryRow>,
    val openingQty: Double,
    val totalInQty: Double,
    val totalOutQty: Double,
    val totalInAmount: Double,
    val totalOutAmount: Double,
    val closingQty: Double
)

@Serializable
data class OutstandingBill(
    val id: String = "",
    @SerialName("company_id") val companyId: String = "",
    @SerialName("ledger_name") val ledgerName: String = "",
    val direction: String = "receivable",
    @Serializable(with = FlexibleDoubleSerializer::class)
    val amount: Double? = null
) {
    val effectiveAmount: Double get() = abs(amount ?: 0.0)
    val isReceivable: Boolean get() = direction.equals("receivable", ignoreCase = true)
}

@Serializable
data class SyncHistoryEntry(
    val id: String = "",
    @SerialName("company_id") val companyId: String = "",
    @SerialName("sync_type") val syncType: String? = null,
    val status: String = "",
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @Serializable(with = FlexibleIntSerializer::class)
    @SerialName("vouchers_synced") val vouchersSynced: Int = 0,
    @Serializable(with = FlexibleIntSerializer::class)
    @SerialName("ledgers_synced") val ledgersSynced: Int = 0,
    @Serializable(with = FlexibleIntSerializer::class)
    @SerialName("stock_synced") val stockSynced: Int = 0,
    @Serializable(with = FlexibleIntSerializer::class)
    @SerialName("total_records") val totalRecords: Int = 0,
    @SerialName("error_message") val errorMessage: String? = null
)

@Serializable
data class PendingTransaction(
    val id: String = "",
    @SerialName("company_id") val companyId: String = "",
    @SerialName("transaction_type") val transactionType: String = "",
    val status: String = "pending",
    @SerialName("error_message") val errorMessage: String? = null,
    @SerialName("tally_voucher_number") val tallyVoucherNumber: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("synced_at") val syncedAt: String? = null,
    @SerialName("voucher_data") val voucherData: JsonObject? = null
)

data class MonthlyBarPoint(
    val monthKey: String,
    val label: String,
    val sales: Double,
    val purchases: Double
)

data class DashboardSummary(
    val totalSales: Double,
    val totalPurchases: Double,
    val totalReceipts: Double,
    val totalPayments: Double,
    val totalReceivables: Double,
    val totalPayables: Double,
    val ledgerCount: Int,
    val voucherCount: Int,
    val stockCount: Int,
    val pendingQueueCount: Int,
    val lastSyncAt: String?,
    val monthlySeries: List<MonthlyBarPoint>,
    val recentVouchers: List<Voucher>
)
