package com.syncoraa.nativeapp.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.syncoraa.nativeapp.BuildConfig
import com.syncoraa.nativeapp.data.SessionExpiredException
import com.syncoraa.nativeapp.data.SharedPrefsSessionStore
import com.syncoraa.nativeapp.data.SupabaseClient
import com.syncoraa.nativeapp.model.AuthSession
import com.syncoraa.nativeapp.model.Company
import com.syncoraa.nativeapp.model.DashboardSummary
import com.syncoraa.nativeapp.model.Ledger
import com.syncoraa.nativeapp.model.LicenseInfo
import com.syncoraa.nativeapp.model.OutstandingBill
import com.syncoraa.nativeapp.model.PendingTransaction
import com.syncoraa.nativeapp.model.StockHistoryResult
import com.syncoraa.nativeapp.model.StockItem
import com.syncoraa.nativeapp.model.SyncHistoryEntry
import com.syncoraa.nativeapp.model.Voucher
import com.syncoraa.nativeapp.model.VoucherDetail
import com.syncoraa.nativeapp.util.FinancialYearOption
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.util.LedgerPeriodResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class AsyncState<T>(
    val data: T? = null,
    val loading: Boolean = false,
    val error: String? = null
)

data class SyncStatusBundle(
    val voucherCount: Int,
    val ledgerCount: Int,
    val stockCount: Int,
    val lastSyncAt: String?,
    val history: List<SyncHistoryEntry>,
    val pendingQueue: List<PendingTransaction>
)

data class AppUiState(
    val session: AuthSession? = null,
    val authLoading: Boolean = false,
    val authError: String? = null,
    val authNotice: String? = null,
    val license: LicenseInfo? = null,
    val darkMode: String = "system",
    val companies: AsyncState<List<Company>> = AsyncState(),
    val selectedCompany: Company? = null,
    val financialYears: List<FinancialYearOption> = Formatters.financialYearOptions(),
    val selectedFy: FinancialYearOption = Formatters.currentFinancialYear(),
    val dashboard: AsyncState<DashboardSummary> = AsyncState(),
    val ledgers: AsyncState<List<Ledger>> = AsyncState(),
    val selectedLedger: Ledger? = null,
    val ledgerStatement: AsyncState<LedgerPeriodResult> = AsyncState(),
    val vouchers: AsyncState<List<Voucher>> = AsyncState(),
    val voucherDetail: AsyncState<VoucherDetail> = AsyncState(),
    val stockItems: AsyncState<List<StockItem>> = AsyncState(),
    val stockHistory: AsyncState<StockHistoryResult> = AsyncState(),
    val outstandings: AsyncState<List<OutstandingBill>> = AsyncState(),
    val syncStatus: AsyncState<SyncStatusBundle> = AsyncState(),
    val submittingVoucher: Boolean = false
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionStore = SharedPrefsSessionStore(application)
    val client = SupabaseClient(
        baseUrl = BuildConfig.SUPABASE_URL,
        anonKey = BuildConfig.SUPABASE_ANON_KEY,
        sessionStore = sessionStore
    )

    private val _state = MutableStateFlow(
        AppUiState(
            session = sessionStore.getSession(),
            darkMode = sessionStore.getDarkMode()
        )
    )
    val state: StateFlow<AppUiState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    private var companyLoadJob: Job? = null
    private var dashboardJob: Job? = null
    private var ledgersJob: Job? = null
    private var statementJob: Job? = null
    private var vouchersJob: Job? = null
    private var voucherDetailJob: Job? = null
    private var stockJob: Job? = null
    private var stockHistoryJob: Job? = null
    private var outstandingJob: Job? = null
    private var syncJob: Job? = null

    init {
        if (_state.value.session != null) {
            bootstrapAuthenticatedSession()
        }
    }

    fun emitMessage(text: String) {
        _messages.tryEmit(text)
    }

    private fun handleError(err: Throwable, fallback: String): String {
        if (err is SessionExpiredException) {
            cancelCompanyJobs()
            _state.update {
                AppUiState(
                    session = null,
                    darkMode = it.darkMode,
                    authError = err.message
                )
            }
            emitMessage(err.message ?: "Session expired. Please sign in again.")
        }
        return err.message?.takeIf { it.isNotBlank() } ?: fallback
    }

    private fun cancelCompanyJobs() {
        dashboardJob?.cancel()
        ledgersJob?.cancel()
        statementJob?.cancel()
        vouchersJob?.cancel()
        voucherDetailJob?.cancel()
        stockJob?.cancel()
        stockHistoryJob?.cancel()
        outstandingJob?.cancel()
        syncJob?.cancel()
    }

    private fun bootstrapAuthenticatedSession() {
        viewModelScope.launch {
            runCatching { client.getLicenseStatus() }
                .onSuccess { lic -> _state.update { it.copy(license = lic) } }
                .onFailure { handleError(it, "License check failed") }
        }
        loadCompanies(autoSelectSaved = true)
    }

    fun signIn(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _state.update { it.copy(authError = "Enter both email and password.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(authLoading = true, authError = null, authNotice = null) }
            try {
                val session = client.signIn(email, password)
                _state.update { it.copy(session = session, authLoading = false, authError = null) }
                bootstrapAuthenticatedSession()
            } catch (err: Throwable) {
                _state.update {
                    it.copy(authLoading = false, authError = err.message ?: "Sign in failed.")
                }
            }
        }
    }

    fun signUp(email: String, password: String, name: String) {
        if (name.isBlank() || email.isBlank() || password.length < 6) {
            _state.update {
                it.copy(authError = "Enter your name, valid email, and password (min 6 characters).")
            }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(authLoading = true, authError = null, authNotice = null) }
            try {
                val session = client.signUp(email, password, name)
                if (session != null) {
                    _state.update { it.copy(session = session, authLoading = false) }
                    bootstrapAuthenticatedSession()
                } else {
                    _state.update {
                        it.copy(
                            authLoading = false,
                            authNotice = "Account created! Check your email to confirm, then sign in."
                        )
                    }
                }
            } catch (err: Throwable) {
                _state.update {
                    it.copy(authLoading = false, authError = err.message ?: "Sign up failed.")
                }
            }
        }
    }

    fun clearAuthMessages() {
        _state.update { it.copy(authError = null, authNotice = null) }
    }

    fun signOut() {
        cancelCompanyJobs()
        companyLoadJob?.cancel()
        viewModelScope.launch {
            client.signOut()
            _state.update {
                AppUiState(session = null, darkMode = it.darkMode)
            }
        }
    }

    fun setDarkMode(mode: String) {
        sessionStore.setDarkMode(mode)
        _state.update { it.copy(darkMode = mode) }
    }

    fun loadCompanies(autoSelectSaved: Boolean = false) {
        companyLoadJob?.cancel()
        companyLoadJob = viewModelScope.launch {
            _state.update { it.copy(companies = it.companies.copy(loading = true, error = null)) }
            try {
                val list = client.listCompanies()
                val savedId = sessionStore.getSelectedCompanyId()
                val current = _state.value.selectedCompany
                val resolvedSelected = when {
                    current != null && list.any { it.id == current.id } ->
                        list.first { it.id == current.id }
                    autoSelectSaved && savedId != null && list.any { it.id == savedId } ->
                        list.first { it.id == savedId }
                    autoSelectSaved && list.size == 1 ->
                        list.first()
                    else -> current
                }
                _state.update {
                    it.copy(
                        companies = AsyncState(data = list, loading = false),
                        selectedCompany = resolvedSelected
                    )
                }
                if (resolvedSelected != null && _state.value.dashboard.data == null) {
                    sessionStore.saveSelectedCompany(resolvedSelected.id, resolvedSelected.name)
                    loadCompanyInitialData()
                }
            } catch (err: Throwable) {
                val msg = handleError(err, "Could not load companies.")
                _state.update { it.copy(companies = it.companies.copy(loading = false, error = msg)) }
            }
        }
    }

    fun selectCompany(company: Company) {
        cancelCompanyJobs()
        sessionStore.saveSelectedCompany(company.id, company.name)
        _state.update {
            it.copy(
                selectedCompany = company,
                dashboard = AsyncState(),
                ledgers = AsyncState(),
                selectedLedger = null,
                ledgerStatement = AsyncState(),
                vouchers = AsyncState(),
                voucherDetail = AsyncState(),
                stockItems = AsyncState(),
                stockHistory = AsyncState(),
                outstandings = AsyncState(),
                syncStatus = AsyncState()
            )
        }
        loadCompanyInitialData()
    }

    fun switchCompanyPrompt() {
        cancelCompanyJobs()
        sessionStore.clearSelectedCompany()
        _state.update { it.copy(selectedCompany = null) }
        loadCompanies(autoSelectSaved = false)
    }

    private fun loadCompanyInitialData() {
        refreshDashboard()
        refreshLedgers()
        refreshVouchers()
        refreshStockItems()
    }

    fun selectFinancialYear(fy: FinancialYearOption) {
        _state.update { it.copy(selectedFy = fy) }
        refreshDashboard()
        refreshVouchers()
    }

    fun refreshDashboard() {
        val company = _state.value.selectedCompany ?: return
        val fy = _state.value.selectedFy
        dashboardJob?.cancel()
        dashboardJob = viewModelScope.launch {
            _state.update { it.copy(dashboard = it.dashboard.copy(loading = true, error = null)) }
            try {
                val summary = client.loadDashboard(company, fy.fromDate, fy.toDate)
                _state.update { it.copy(dashboard = AsyncState(data = summary, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load dashboard.")
                _state.update { it.copy(dashboard = it.dashboard.copy(loading = false, error = msg)) }
            }
        }
    }

    fun refreshLicense() {
        viewModelScope.launch {
            runCatching { client.getLicenseStatus() }
                .onSuccess { lic -> _state.update { it.copy(license = lic) } }
                .onFailure { emitMessage(handleError(it, "Could not refresh license")) }
        }
    }

    fun refreshLedgers() {
        val companyId = _state.value.selectedCompany?.id ?: return
        ledgersJob?.cancel()
        ledgersJob = viewModelScope.launch {
            _state.update { it.copy(ledgers = it.ledgers.copy(loading = true, error = null)) }
            try {
                val list = client.listLedgers(companyId)
                _state.update { it.copy(ledgers = AsyncState(data = list, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load ledgers.")
                _state.update { it.copy(ledgers = it.ledgers.copy(loading = false, error = msg)) }
            }
        }
    }

    fun openLedgerById(ledgerId: String, fromDate: String? = null, toDate: String? = null) {
        val companyId = _state.value.selectedCompany?.id ?: return
        val fy = _state.value.selectedFy
        val from = fromDate ?: fy.fromDate
        val to = toDate ?: fy.toDate
        statementJob?.cancel()
        statementJob = viewModelScope.launch {
            _state.update { it.copy(ledgerStatement = AsyncState(loading = true)) }
            try {
                val allLedgers = _state.value.ledgers.data ?: client.listLedgers(companyId).also { list ->
                    _state.update { it.copy(ledgers = AsyncState(data = list)) }
                }
                val ledger = allLedgers.firstOrNull { it.id == ledgerId }
                    ?: Ledger(id = ledgerId, companyId = companyId, name = ledgerId)
                _state.update { it.copy(selectedLedger = ledger) }
                val res = client.loadLedgerStatement(companyId, ledger, from, to)
                _state.update { it.copy(ledgerStatement = AsyncState(data = res, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load ledger statement.")
                _state.update { it.copy(ledgerStatement = AsyncState(loading = false, error = msg)) }
            }
        }
    }

    suspend fun findLedgerIdByName(name: String): String? {
        val companyId = _state.value.selectedCompany?.id ?: return null
        val list = _state.value.ledgers.data ?: runCatching { client.listLedgers(companyId) }.getOrNull()?.also {
            _state.update { s -> s.copy(ledgers = AsyncState(data = it)) }
        } ?: return null
        return list.firstOrNull { it.name.equals(name, ignoreCase = true) }?.id
    }

    fun refreshVouchers(typeFilter: String? = null) {
        val companyId = _state.value.selectedCompany?.id ?: return
        val fy = _state.value.selectedFy
        vouchersJob?.cancel()
        vouchersJob = viewModelScope.launch {
            _state.update { it.copy(vouchers = it.vouchers.copy(loading = true, error = null)) }
            try {
                val list = client.listVouchers(companyId, fy.fromDate, fy.toDate, typeFilter)
                _state.update { it.copy(vouchers = AsyncState(data = list, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load vouchers.")
                _state.update { it.copy(vouchers = it.vouchers.copy(loading = false, error = msg)) }
            }
        }
    }

    fun loadVoucherDetail(voucherId: String) {
        voucherDetailJob?.cancel()
        voucherDetailJob = viewModelScope.launch {
            _state.update { it.copy(voucherDetail = AsyncState(loading = true)) }
            try {
                val detail = client.getVoucherDetail(voucherId)
                _state.update { it.copy(voucherDetail = AsyncState(data = detail, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load voucher details.")
                _state.update { it.copy(voucherDetail = AsyncState(loading = false, error = msg)) }
            }
        }
    }

    fun refreshStockItems() {
        val companyId = _state.value.selectedCompany?.id ?: return
        stockJob?.cancel()
        stockJob = viewModelScope.launch {
            _state.update { it.copy(stockItems = it.stockItems.copy(loading = true, error = null)) }
            try {
                val list = client.listStockItems(companyId)
                _state.update { it.copy(stockItems = AsyncState(data = list, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load stock items.")
                _state.update { it.copy(stockItems = it.stockItems.copy(loading = false, error = msg)) }
            }
        }
    }

    fun loadStockHistory(itemId: String) {
        val companyId = _state.value.selectedCompany?.id ?: return
        stockHistoryJob?.cancel()
        stockHistoryJob = viewModelScope.launch {
            _state.update { it.copy(stockHistory = AsyncState(loading = true)) }
            try {
                val all = _state.value.stockItems.data ?: client.listStockItems(companyId).also { list ->
                    _state.update { it.copy(stockItems = AsyncState(data = list)) }
                }
                val item = all.firstOrNull { it.id == itemId }
                    ?: StockItem(id = itemId, companyId = companyId, name = itemId)
                val history = client.loadStockHistory(companyId, item)
                _state.update { it.copy(stockHistory = AsyncState(data = history, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load stock movement.")
                _state.update { it.copy(stockHistory = AsyncState(loading = false, error = msg)) }
            }
        }
    }

    fun refreshOutstandings() {
        val companyId = _state.value.selectedCompany?.id ?: return
        outstandingJob?.cancel()
        outstandingJob = viewModelScope.launch {
            _state.update { it.copy(outstandings = it.outstandings.copy(loading = true, error = null)) }
            try {
                val list = client.listOutstandings(companyId)
                _state.update { it.copy(outstandings = AsyncState(data = list, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load outstandings.")
                _state.update { it.copy(outstandings = it.outstandings.copy(loading = false, error = msg)) }
            }
        }
    }

    fun refreshSyncStatus() {
        val company = _state.value.selectedCompany ?: return
        syncJob?.cancel()
        syncJob = viewModelScope.launch {
            _state.update { it.copy(syncStatus = it.syncStatus.copy(loading = true, error = null)) }
            try {
                val vCount = client.getExactCount("/rest/v1/vouchers?company_id=eq.${company.id}&is_deleted=eq.false&select=id")
                val lCount = client.getExactCount("/rest/v1/ledgers?company_id=eq.${company.id}&is_deleted=eq.false&select=id")
                val sCount = client.getExactCount("/rest/v1/stock_items?company_id=eq.${company.id}&select=id")
                val history = client.listSyncHistory(company.id)
                val queue = client.listPendingTransactions(company.id)
                val lastCompleted = history.firstOrNull {
                    it.status.equals("completed", true) || it.status.equals("success", true)
                }?.completedAt ?: company.lastSyncAt

                val bundle = SyncStatusBundle(
                    voucherCount = vCount,
                    ledgerCount = lCount,
                    stockCount = sCount,
                    lastSyncAt = lastCompleted,
                    history = history,
                    pendingQueue = queue
                )
                _state.update { it.copy(syncStatus = AsyncState(data = bundle, loading = false)) }
            } catch (err: Throwable) {
                val msg = handleError(err, "Failed to load sync status.")
                _state.update { it.copy(syncStatus = it.syncStatus.copy(loading = false, error = msg)) }
            }
        }
    }

    data class DraftStockLine(
        val itemName: String,
        val quantity: Double,
        val rate: Double,
        val unit: String,
        val gstRate: Double
    )

    data class DraftLedgerLine(
        val ledgerName: String,
        val amount: Double,
        val isDebit: Boolean
    )

    fun submitCreateVoucher(
        voucherType: String,
        voucherDate: String,
        voucherNumber: String,
        partyName: String,
        narration: String,
        cashBankLedger: String,
        purchaseLedger: String,
        moneyAmount: Double,
        isIgst: Boolean,
        stockLines: List<DraftStockLine>,
        ledgerLines: List<DraftLedgerLine>,
        onSuccess: () -> Unit
    ) {
        val companyId = _state.value.selectedCompany?.id ?: return
        viewModelScope.launch {
            _state.update { it.copy(submittingVoucher = true) }
            try {
                val isMoney = voucherType in setOf("Receipt", "Payment")
                val isLedgerOnly = voucherType in setOf("Journal", "Contra")
                val taxableTotal = stockLines.sumOf { it.quantity * it.rate }
                val totalGst = stockLines.sumOf { (it.quantity * it.rate) * (it.gstRate / 100.0) }
                val cgst = if (isIgst) 0.0 else totalGst / 2.0
                val sgst = if (isIgst) 0.0 else totalGst / 2.0
                val igst = if (isIgst) totalGst else 0.0
                val grandTotal = when {
                    isMoney -> moneyAmount
                    isLedgerOnly -> ledgerLines.filter { it.isDebit }.sumOf { it.amount }
                    else -> taxableTotal + totalGst
                }

                val stockJson = JsonArray(stockLines.map { line ->
                    val taxable = line.quantity * line.rate
                    val gstAmt = taxable * (line.gstRate / 100.0)
                    buildJsonObject {
                        put("item_name", line.itemName)
                        put("stock_item_name", line.itemName)
                        put("quantity", line.quantity)
                        put("rate", line.rate)
                        put("unit", line.unit)
                        put("tax_rate", line.gstRate)
                        put("amount", taxable)
                        put("gst_amount", gstAmt)
                        put("total", taxable + gstAmt)
                    }
                })

                val ledgerJson = JsonArray(ledgerLines.map { line ->
                    buildJsonObject {
                        put("ledger_name", line.ledgerName)
                        put("amount", line.amount)
                        put("type", if (line.isDebit) "Dr" else "Cr")
                        put("is_debit", line.isDebit)
                    }
                })

                val voucherData = buildJsonObject {
                    put("voucher_type", voucherType)
                    put("voucher_type_name", voucherType)
                    put("voucher_date", voucherDate)
                    put("invoice_date", voucherDate)
                    put("voucher_number", voucherNumber.ifBlank { "MOBILE-${System.currentTimeMillis()}" })
                    put("party_name", partyName)
                    put("narration", narration)
                    put("total_amount", if (isMoney || isLedgerOnly) grandTotal else taxableTotal)
                    put("gst_amount", totalGst)
                    put("cgst_amount", cgst)
                    put("sgst_amount", sgst)
                    put("igst_amount", igst)
                    put("grand_total", grandTotal)
                    put("amount", grandTotal)
                    if (cashBankLedger.isNotBlank()) put("cash_bank_ledger", cashBankLedger.trim())
                    if (purchaseLedger.isNotBlank()) put("purchase_ledger", purchaseLedger.trim())
                    put("stock_entries", stockJson)
                    put("ledger_entries", ledgerJson)
                    put("source", "mobile")
                }

                client.queueCreateVoucher(companyId, voucherType, voucherData)
                _state.update { it.copy(submittingVoucher = false) }
                emitMessage("$voucherType queued for Tally sync.")
                refreshDashboard()
                refreshSyncStatus()
                onSuccess()
            } catch (err: Throwable) {
                _state.update { it.copy(submittingVoucher = false) }
                emitMessage(handleError(err, "Failed to queue voucher."))
            }
        }
    }

    fun deleteVoucher(voucher: Voucher, onSuccess: () -> Unit) {
        val companyId = _state.value.selectedCompany?.id ?: return
        if (voucher.guid.isNullOrBlank()) {
            emitMessage("This voucher is not synced with a Tally GUID yet.")
            return
        }
        viewModelScope.launch {
            try {
                client.queueDeleteVoucher(companyId, voucher)
                emitMessage("Delete queued. Desktop Connector will delete it from Tally on next sync.")
                refreshVouchers()
                refreshSyncStatus()
                onSuccess()
            } catch (err: Throwable) {
                emitMessage(handleError(err, "Could not queue voucher deletion."))
            }
        }
    }

    fun retryFailedTx(txId: String) {
        val companyId = _state.value.selectedCompany?.id ?: return
        viewModelScope.launch {
            try {
                val ok = client.retryFailedTransaction(companyId, txId)
                if (ok) {
                    emitMessage("Transaction requeued for Tally.")
                    refreshSyncStatus()
                } else {
                    emitMessage("Transaction could not be requeued.")
                }
            } catch (err: Throwable) {
                emitMessage(handleError(err, "Retry failed."))
            }
        }
    }
}
