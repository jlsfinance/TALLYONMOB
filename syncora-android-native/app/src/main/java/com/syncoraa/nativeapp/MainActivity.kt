package com.syncoraa.nativeapp

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.syncoraa.nativeapp.ui.screens.CreateVoucherScreen
import com.syncoraa.nativeapp.ui.screens.DashboardScreen
import com.syncoraa.nativeapp.ui.screens.DayBookScreen
import com.syncoraa.nativeapp.ui.screens.LedgerDetailScreen
import com.syncoraa.nativeapp.ui.screens.LoginScreen
import com.syncoraa.nativeapp.ui.screens.MoreScreen
import com.syncoraa.nativeapp.ui.screens.OutstandingScreen
import com.syncoraa.nativeapp.ui.screens.PartiesScreen
import com.syncoraa.nativeapp.ui.screens.SelectCompanyScreen
import com.syncoraa.nativeapp.ui.screens.StockDetailScreen
import com.syncoraa.nativeapp.ui.screens.StockScreen
import com.syncoraa.nativeapp.ui.screens.SyncStatusScreen
import com.syncoraa.nativeapp.ui.screens.VoucherDetailScreen
import com.syncoraa.nativeapp.ui.theme.SyncoraNativeTheme
import com.syncoraa.nativeapp.viewmodel.AppViewModel
import kotlinx.coroutines.launch

private enum class BottomTab(val route: String, val label: String, val icon: ImageVector) {
    DASHBOARD("dashboard", "Dashboard", Icons.Default.Dashboard),
    PARTIES("parties", "Parties", Icons.Default.People),
    DAYBOOK("daybook", "DayBook", Icons.Default.ReceiptLong),
    STOCK("stock", "Stock", Icons.Default.Inventory2),
    MORE("more", "More", Icons.Default.MoreHoriz)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val vm: AppViewModel = viewModel()
            SyncoraRoot(vm)
        }
    }
}

@Composable
private fun SyncoraRoot(vm: AppViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        vm.messages.collect { msg ->
            snackbarHostState.showSnackbar(msg)
        }
    }

    SyncoraNativeTheme(darkModeSetting = state.darkMode) {
        val company = state.selectedCompany
        if (state.session == null) {
            Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
                Box(Modifier.padding(padding)) {
                    LoginScreen(
                        loading = state.authLoading,
                        error = state.authError,
                        notice = state.authNotice,
                        onSignIn = vm::signIn,
                        onSignUp = vm::signUp,
                        onClearMessages = vm::clearAuthMessages
                    )
                }
            }
        } else if (company == null) {
            Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
                Box(Modifier.padding(padding)) {
                    SelectCompanyScreen(
                        userEmail = state.session?.email.orEmpty(),
                        companiesState = state.companies,
                        onSelect = vm::selectCompany,
                        onRefresh = { vm.loadCompanies(autoSelectSaved = false) },
                        onSignOut = vm::signOut
                    )
                }
            }
        } else {
            val navController = rememberNavController()
            val backEntry by navController.currentBackStackEntryAsState()
            val currentRoute = backEntry?.destination?.route
            val showBottomBar = BottomTab.entries.any { it.route == currentRoute }

            Scaffold(
                snackbarHost = { SnackbarHost(snackbarHostState) },
                contentWindowInsets = WindowInsets(0, 0, 0, 0),
                bottomBar = {
                    if (showBottomBar) {
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                            BottomTab.entries.forEach { tab ->
                                NavigationBarItem(
                                    selected = currentRoute == tab.route,
                                    onClick = {
                                        if (currentRoute != tab.route) {
                                            navController.navigate(tab.route) {
                                                popUpTo(BottomTab.DASHBOARD.route) { saveState = true }
                                                launchSingleTop = true
                                                restoreState = true
                                            }
                                        }
                                    },
                                    icon = { Icon(tab.icon, contentDescription = tab.label) },
                                    label = { Text(tab.label, maxLines = 1) }
                                )
                            }
                        }
                    }
                }
            ) { innerPadding ->
                NavHost(
                    navController = navController,
                    startDestination = BottomTab.DASHBOARD.route,
                    modifier = Modifier.padding(innerPadding)
                ) {
                    composable(BottomTab.DASHBOARD.route) {
                        DashboardScreen(
                            company = company,
                            license = state.license,
                            fyOptions = state.financialYears,
                            selectedFy = state.selectedFy,
                            dashboardState = state.dashboard,
                            onSelectFy = vm::selectFinancialYear,
                            onRefresh = vm::refreshDashboard,
                            onSwitchCompany = vm::switchCompanyPrompt,
                            onOpenCreateVoucher = { navController.navigate("create_voucher") },
                            onOpenOutstandings = { navController.navigate("outstandings") },
                            onOpenSyncStatus = { navController.navigate("sync_status") },
                            onOpenVoucher = { id -> navController.navigate("voucher/${Uri.encode(id)}") }
                        )
                    }

                    composable(BottomTab.PARTIES.route) {
                        PartiesScreen(
                            companyName = company.name,
                            ledgersState = state.ledgers,
                            onRefresh = vm::refreshLedgers,
                            onOpenLedger = { ledger ->
                                navController.navigate("ledger/${Uri.encode(ledger.id)}")
                            }
                        )
                    }

                    composable(BottomTab.DAYBOOK.route) {
                        DayBookScreen(
                            companyName = company.name,
                            fyLabel = state.selectedFy.label,
                            vouchersState = state.vouchers,
                            onRefresh = { vm.refreshVouchers() },
                            onOpenVoucher = { id -> navController.navigate("voucher/${Uri.encode(id)}") },
                            onOpenCreateVoucher = { navController.navigate("create_voucher") }
                        )
                    }

                    composable(BottomTab.STOCK.route) {
                        StockScreen(
                            companyName = company.name,
                            stockState = state.stockItems,
                            onRefresh = vm::refreshStockItems,
                            onOpenStockItem = { item ->
                                navController.navigate("stock/${Uri.encode(item.id)}")
                            }
                        )
                    }

                    composable(BottomTab.MORE.route) {
                        MoreScreen(
                            userEmail = state.session?.email.orEmpty(),
                            company = company,
                            license = state.license,
                            darkMode = state.darkMode,
                            onSetDarkMode = vm::setDarkMode,
                            onRefreshLicense = vm::refreshLicense,
                            onOpenOutstandings = { navController.navigate("outstandings") },
                            onOpenSyncStatus = { navController.navigate("sync_status") },
                            onSwitchCompany = vm::switchCompanyPrompt,
                            onSignOut = vm::signOut
                        )
                    }

                    composable(
                        route = "ledger/{ledgerId}",
                        arguments = listOf(navArgument("ledgerId") { type = NavType.StringType })
                    ) { entry ->
                        val ledgerId = entry.arguments?.getString("ledgerId").orEmpty()
                        LedgerDetailScreen(
                            ledgerId = ledgerId,
                            company = company,
                            ledger = state.selectedLedger,
                            fyOptions = state.financialYears,
                            initialFy = state.selectedFy,
                            statementState = state.ledgerStatement,
                            onLoadStatement = { id, from, to -> vm.openLedgerById(id, from, to) },
                            onOpenVoucher = { id -> navController.navigate("voucher/${Uri.encode(id)}") },
                            onBack = { navController.popBackStack() },
                            onNotify = vm::emitMessage
                        )
                    }

                    composable(
                        route = "voucher/{voucherId}",
                        arguments = listOf(navArgument("voucherId") { type = NavType.StringType })
                    ) { entry ->
                        val voucherId = entry.arguments?.getString("voucherId").orEmpty()
                        VoucherDetailScreen(
                            voucherId = voucherId,
                            company = company,
                            detailState = state.voucherDetail,
                            onLoad = vm::loadVoucherDetail,
                            onDelete = { voucher ->
                                vm.deleteVoucher(voucher) { navController.popBackStack() }
                            },
                            onBack = { navController.popBackStack() },
                            onNotify = vm::emitMessage
                        )
                    }

                    composable(
                        route = "stock/{itemId}",
                        arguments = listOf(navArgument("itemId") { type = NavType.StringType })
                    ) { entry ->
                        val itemId = entry.arguments?.getString("itemId").orEmpty()
                        StockDetailScreen(
                            itemId = itemId,
                            historyState = state.stockHistory,
                            onLoad = vm::loadStockHistory,
                            onOpenVoucher = { id -> navController.navigate("voucher/${Uri.encode(id)}") },
                            onBack = { navController.popBackStack() }
                        )
                    }

                    composable("create_voucher") {
                        CreateVoucherScreen(
                            companyName = company.name,
                            ledgers = state.ledgers.data.orEmpty(),
                            stockItems = state.stockItems.data.orEmpty(),
                            submitting = state.submittingVoucher,
                            onSubmit = { type, date, num, party, narr, cb, purch, amt, igst, stock, ledgers ->
                                vm.submitCreateVoucher(
                                    voucherType = type,
                                    voucherDate = date,
                                    voucherNumber = num,
                                    partyName = party,
                                    narration = narr,
                                    cashBankLedger = cb,
                                    purchaseLedger = purch,
                                    moneyAmount = amt,
                                    isIgst = igst,
                                    stockLines = stock,
                                    ledgerLines = ledgers,
                                    onSuccess = { navController.popBackStack() }
                                )
                            },
                            onNotify = vm::emitMessage,
                            onBack = { navController.popBackStack() }
                        )
                    }

                    composable("outstandings") {
                        OutstandingScreen(
                            companyName = company.name,
                            outstandingsState = state.outstandings,
                            onRefresh = vm::refreshOutstandings,
                            onOpenParty = { partyName ->
                                scope.launch {
                                    val ledgerId = vm.findLedgerIdByName(partyName)
                                    if (ledgerId != null) {
                                        navController.navigate("ledger/${Uri.encode(ledgerId)}")
                                    } else {
                                        vm.emitMessage("Ledger details for '$partyName' not synced yet.")
                                    }
                                }
                            },
                            onBack = { navController.popBackStack() }
                        )
                    }

                    composable("sync_status") {
                        SyncStatusScreen(
                            companyName = company.name,
                            syncState = state.syncStatus,
                            onRefresh = vm::refreshSyncStatus,
                            onRetryTx = vm::retryFailedTx,
                            onBack = { navController.popBackStack() }
                        )
                    }
                }
            }
        }
    }
}
