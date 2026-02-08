import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Users,
    Building2,
    RefreshCw,
    Clock,
    Download,
    Settings,
    History,
    Trash2,
    Eye,
    Save,
    Shield,
    LogOut,
    LayoutDashboard,
    ArrowLeft,
    FileText,
    IndianRupee,
    Package,
    BookOpen,
    X
} from 'lucide-react';
import supabase from '../lib/supabase';
import toast from 'react-hot-toast';

const ADMIN_EMAILS = ['lovneetrathi@gmail.com']; // Super admins

const AdminDashboardPage = () => {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    // Stats
    const [stats, setStats] = useState({
        totalUsers: 0,
        totalCompanies: 0,
        activeSyncsToday: 0,
        pendingTransactions: 0
    });

    // Data
    const [allUsers, setAllUsers] = useState([]);
    const [allCompanies, setAllCompanies] = useState([]);

    // Drill-down states
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedUserCompanies, setSelectedUserCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [companyData, setCompanyData] = useState(null);
    const [loadingCompanyData, setLoadingCompanyData] = useState(false);

    // Settings
    const [downloadUrl, setDownloadUrl] = useState('');
    const [appVersion, setAppVersion] = useState('1.0.0');
    const [saving, setSaving] = useState(false);

    // Check admin access
    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        const checkAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase());
        setIsAdmin(checkAdmin);

        if (!checkAdmin) {
            toast.error('Access denied. Admin only.');
            navigate('/');
            return;
        }

        loadData();
    }, [user]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load all companies (admin sees all)
            const { data: companies } = await supabase
                .from('companies')
                .select('*')
                .order('created_at', { ascending: false });

            setAllCompanies(companies || []);

            // Extract unique users from companies
            const userMap = {};
            (companies || []).forEach(c => {
                if (c.owner_id) {
                    if (!userMap[c.owner_id]) {
                        userMap[c.owner_id] = {
                            id: c.owner_id,
                            companiesCount: 0
                        };
                    }
                    userMap[c.owner_id].companiesCount++;
                }
            });
            setAllUsers(Object.values(userMap));

            // Load settings
            const { data: settings } = await supabase
                .from('app_settings')
                .select('*');

            if (settings) {
                const urlSetting = settings.find(s => s.key === 'windows_app_download_url');
                const versionSetting = settings.find(s => s.key === 'app_version');
                if (urlSetting) setDownloadUrl(urlSetting.value);
                if (versionSetting) setAppVersion(versionSetting.value);
            }

            // Get pending transactions count
            const { count: pendingCount } = await supabase
                .from('pending_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            // Get today's syncs
            const today = new Date().toISOString().split('T')[0];
            const { count: syncsToday } = await supabase
                .from('sync_history')
                .select('*', { count: 'exact', head: true })
                .gte('started_at', today);

            setStats({
                totalUsers: Object.keys(userMap).length,
                totalCompanies: (companies || []).length,
                activeSyncsToday: syncsToday || 0,
                pendingTransactions: pendingCount || 0
            });

        } catch (error) {
            console.error('Load error:', error);
        }
        setLoading(false);
    };

    // Load user's companies
    const loadUserCompanies = async (userId) => {
        const userCompanies = allCompanies.filter(c => c.owner_id === userId);
        setSelectedUserCompanies(userCompanies);
        setSelectedUser(userId);
    };

    // Load full company data
    const loadCompanyData = async (company) => {
        setLoadingCompanyData(true);
        setSelectedCompany(company);

        try {
            // Load all related data
            const [ledgers, vouchers, stockItems, groups] = await Promise.all([
                supabase.from('ledgers').select('*').eq('company_id', company.id).limit(100),
                supabase.from('vouchers').select('*').eq('company_id', company.id).order('invoice_date', { ascending: false }).limit(100),
                supabase.from('stock_items').select('*').eq('company_id', company.id).limit(100),
                supabase.from('groups').select('*').eq('company_id', company.id).limit(100)
            ]);

            // Calculate stats
            const salesVouchers = (vouchers.data || []).filter(v => v.voucher_type === 'Sales');
            const purchaseVouchers = (vouchers.data || []).filter(v => v.voucher_type === 'Purchase');

            const totalSales = salesVouchers.reduce((sum, v) => sum + (parseFloat(v.net_amount) || 0), 0);
            const totalPurchase = purchaseVouchers.reduce((sum, v) => sum + (parseFloat(v.net_amount) || 0), 0);

            setCompanyData({
                ledgers: ledgers.data || [],
                vouchers: vouchers.data || [],
                stockItems: stockItems.data || [],
                groups: groups.data || [],
                stats: {
                    ledgersCount: (ledgers.data || []).length,
                    vouchersCount: (vouchers.data || []).length,
                    stockItemsCount: (stockItems.data || []).length,
                    groupsCount: (groups.data || []).length,
                    totalSales,
                    totalPurchase,
                    salesCount: salesVouchers.length,
                    purchaseCount: purchaseVouchers.length
                }
            });
        } catch (error) {
            console.error('Error loading company data:', error);
            toast.error('Failed to load company data');
        }
        setLoadingCompanyData(false);
    };

    const closeCompanyView = () => {
        setSelectedCompany(null);
        setCompanyData(null);
    };

    const closeUserView = () => {
        setSelectedUser(null);
        setSelectedUserCompanies([]);
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            await supabase
                .from('app_settings')
                .upsert([
                    { key: 'windows_app_download_url', value: downloadUrl, updated_at: new Date().toISOString() },
                    { key: 'app_version', value: appVersion, updated_at: new Date().toISOString() }
                ], { onConflict: 'key' });

            toast.success('Settings saved!');
        } catch (error) {
            toast.error('Failed to save settings');
        }
        setSaving(false);
    };

    const deleteCompany = async (id) => {
        if (!confirm('Delete this company and all its data? This cannot be undone.')) return;

        try {
            await supabase.from('companies').delete().eq('id', id);
            toast.success('Company deleted');
            loadData();
            closeCompanyView();
        } catch (error) {
            toast.error('Delete failed');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    if (!isAdmin) {
        return (
            <div className="admin-page">
                <div className="access-denied">
                    <Shield size={64} />
                    <h2>Access Denied</h2>
                    <p>This area is for administrators only.</p>
                </div>
            </div>
        );
    }

    const sidebarItems = [
        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { id: 'users', icon: Users, label: 'Users' },
        { id: 'companies', icon: Building2, label: 'Companies' },
        { id: 'settings', icon: Settings, label: 'Settings' },
        { id: 'logs', icon: History, label: 'Logs' }
    ];

    // Company Full View Modal
    const CompanyDataModal = () => {
        if (!selectedCompany || !companyData) return null;

        const [dataTab, setDataTab] = useState('overview');

        return (
            <div className="modal-overlay">
                <div className="modal-content company-modal">
                    <div className="modal-header">
                        <div>
                            <h2>{selectedCompany.name}</h2>
                            <p>GSTIN: {selectedCompany.gstin || 'N/A'} | Owner: {selectedCompany.owner_id?.substring(0, 8)}</p>
                        </div>
                        <button className="close-btn" onClick={closeCompanyView}>
                            <X size={24} />
                        </button>
                    </div>

                    {/* Company Stats */}
                    <div className="company-stats-grid">
                        <div className="company-stat">
                            <IndianRupee size={20} />
                            <div>
                                <span className="stat-label">Total Sales</span>
                                <span className="stat-value green">{formatCurrency(companyData.stats.totalSales)}</span>
                            </div>
                        </div>
                        <div className="company-stat">
                            <IndianRupee size={20} />
                            <div>
                                <span className="stat-label">Total Purchase</span>
                                <span className="stat-value orange">{formatCurrency(companyData.stats.totalPurchase)}</span>
                            </div>
                        </div>
                        <div className="company-stat">
                            <BookOpen size={20} />
                            <div>
                                <span className="stat-label">Ledgers</span>
                                <span className="stat-value">{companyData.stats.ledgersCount}</span>
                            </div>
                        </div>
                        <div className="company-stat">
                            <FileText size={20} />
                            <div>
                                <span className="stat-label">Vouchers</span>
                                <span className="stat-value">{companyData.stats.vouchersCount}</span>
                            </div>
                        </div>
                        <div className="company-stat">
                            <Package size={20} />
                            <div>
                                <span className="stat-label">Stock Items</span>
                                <span className="stat-value">{companyData.stats.stockItemsCount}</span>
                            </div>
                        </div>
                    </div>

                    {/* Data Tabs */}
                    <div className="data-tabs">
                        <button className={dataTab === 'overview' ? 'active' : ''} onClick={() => setDataTab('overview')}>Overview</button>
                        <button className={dataTab === 'ledgers' ? 'active' : ''} onClick={() => setDataTab('ledgers')}>Ledgers</button>
                        <button className={dataTab === 'vouchers' ? 'active' : ''} onClick={() => setDataTab('vouchers')}>Vouchers</button>
                        <button className={dataTab === 'stock' ? 'active' : ''} onClick={() => setDataTab('stock')}>Stock Items</button>
                    </div>

                    <div className="data-content">
                        {dataTab === 'overview' && (
                            <div className="overview-grid">
                                <div className="overview-card">
                                    <h4>Sales Invoices</h4>
                                    <span className="big-number">{companyData.stats.salesCount}</span>
                                </div>
                                <div className="overview-card">
                                    <h4>Purchase Invoices</h4>
                                    <span className="big-number">{companyData.stats.purchaseCount}</span>
                                </div>
                                <div className="overview-card">
                                    <h4>Groups</h4>
                                    <span className="big-number">{companyData.stats.groupsCount}</span>
                                </div>
                            </div>
                        )}

                        {dataTab === 'ledgers' && (
                            <div className="data-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Ledger Name</th>
                                            <th>Group</th>
                                            <th>Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {companyData.ledgers.slice(0, 50).map((l, i) => (
                                            <tr key={i}>
                                                <td>{l.name}</td>
                                                <td>{l.parent_group || '-'}</td>
                                                <td className={parseFloat(l.closing_balance) >= 0 ? 'green' : 'red'}>
                                                    {formatCurrency(l.closing_balance)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {dataTab === 'vouchers' && (
                            <div className="data-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Type</th>
                                            <th>Party</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {companyData.vouchers.slice(0, 50).map((v, i) => (
                                            <tr key={i}>
                                                <td>{v.invoice_date ? new Date(v.invoice_date).toLocaleDateString() : '-'}</td>
                                                <td>
                                                    <span className={`type-badge ${v.voucher_type?.toLowerCase()}`}>
                                                        {v.voucher_type}
                                                    </span>
                                                </td>
                                                <td>{v.party_name || '-'}</td>
                                                <td>{formatCurrency(v.net_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {dataTab === 'stock' && (
                            <div className="data-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Item Name</th>
                                            <th>Unit</th>
                                            <th>Closing Qty</th>
                                            <th>Closing Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {companyData.stockItems.slice(0, 50).map((s, i) => (
                                            <tr key={i}>
                                                <td>{s.name}</td>
                                                <td>{s.unit || '-'}</td>
                                                <td>{s.closing_balance || 0}</td>
                                                <td>{formatCurrency(s.closing_value)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button className="delete-btn" onClick={() => deleteCompany(selectedCompany.id)}>
                            <Trash2 size={18} /> Delete Company
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="admin-page">
            {/* Company Data Modal */}
            {selectedCompany && companyData && <CompanyDataModal />}

            {/* Loading Modal */}
            {loadingCompanyData && (
                <div className="modal-overlay">
                    <div className="loading-modal">
                        <RefreshCw size={40} className="spinning" />
                        <p>Loading company data...</p>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <aside className="admin-sidebar">
                <div className="sidebar-logo">
                    <Shield size={28} />
                    <span>TallyOnMob</span>
                    <small>Admin</small>
                </div>

                <nav className="sidebar-nav">
                    {sidebarItems.map(item => (
                        <button
                            key={item.id}
                            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab(item.id);
                                closeUserView();
                            }}
                        >
                            <item.icon size={20} />
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="admin-info">
                        <span className="admin-badge">Super Admin</span>
                        <span className="admin-email">{user?.email}</span>
                    </div>
                    <button className="logout-btn" onClick={signOut}>
                        <LogOut size={18} />
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                <header className="admin-header">
                    <div>
                        <h1>
                            {selectedUser ? (
                                <>
                                    <button className="back-btn" onClick={closeUserView}>
                                        <ArrowLeft size={20} />
                                    </button>
                                    User: {selectedUser.substring(0, 8)}...
                                </>
                            ) : 'Management Console'}
                        </h1>
                        <p>{selectedUser ? `Viewing ${selectedUserCompanies.length} companies` : "Welcome back, here's what's happening today."}</p>
                    </div>
                    <button className="refresh-btn" onClick={loadData} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                        Refresh
                    </button>
                </header>

                {/* User Drill-Down View */}
                {selectedUser && (
                    <div className="user-companies-view">
                        <div className="table-card full">
                            <h3><Building2 size={20} /> Companies for User</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Company Name</th>
                                        <th>GSTIN</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedUserCompanies.map(company => (
                                        <tr key={company.id} className="clickable" onClick={() => loadCompanyData(company)}>
                                            <td className="company-name">{company.name}</td>
                                            <td className="gstin">{company.gstin || '-'}</td>
                                            <td className="created">{new Date(company.created_at).toLocaleDateString()}</td>
                                            <td className="actions">
                                                <button className="action-btn view" onClick={(e) => { e.stopPropagation(); loadCompanyData(company); }}>
                                                    <Eye size={16} />
                                                </button>
                                                <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); deleteCompany(company.id); }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Dashboard Tab */}
                {activeTab === 'dashboard' && !selectedUser && (
                    <>
                        {/* Stats Cards */}
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-icon users"><Users size={24} /></div>
                                <div className="stat-content">
                                    <span className="stat-label">Total Users</span>
                                    <span className="stat-value">{stats.totalUsers}</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon companies"><Building2 size={24} /></div>
                                <div className="stat-content">
                                    <span className="stat-label">Total Companies</span>
                                    <span className="stat-value">{stats.totalCompanies}</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon syncs"><RefreshCw size={24} /></div>
                                <div className="stat-content">
                                    <span className="stat-label">Syncs Today</span>
                                    <span className="stat-value">{stats.activeSyncsToday}</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon pending"><Clock size={24} /></div>
                                <div className="stat-content">
                                    <span className="stat-label">Pending</span>
                                    <span className="stat-value">{stats.pendingTransactions}</span>
                                </div>
                            </div>
                        </div>

                        {/* Download Settings */}
                        <div className="settings-card">
                            <h3><Download size={20} /> Windows App Settings</h3>
                            <div className="settings-form">
                                <div className="form-group">
                                    <label>Download URL</label>
                                    <input type="url" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} placeholder="https://..." />
                                </div>
                                <div className="form-group">
                                    <label>App Version</label>
                                    <input type="text" value={appVersion} onChange={(e) => setAppVersion(e.target.value)} placeholder="1.0.0" />
                                </div>
                                <button className="save-btn" onClick={saveSettings} disabled={saving}>
                                    <Save size={18} />
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>

                        {/* Recent Companies */}
                        <div className="table-card">
                            <h3><Building2 size={20} /> Recent Companies</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Company Name</th>
                                        <th>Owner ID</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allCompanies.slice(0, 10).map(company => (
                                        <tr key={company.id} className="clickable" onClick={() => loadCompanyData(company)}>
                                            <td className="company-name">{company.name}</td>
                                            <td className="owner-id">{company.owner_id?.substring(0, 8) || 'N/A'}</td>
                                            <td className="created">{new Date(company.created_at).toLocaleDateString()}</td>
                                            <td className="actions">
                                                <button className="action-btn view"><Eye size={16} /></button>
                                                <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); deleteCompany(company.id); }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && !selectedUser && (
                    <div className="table-card full">
                        <h3><Users size={20} /> All Users ({allUsers.length})</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>User ID</th>
                                    <th>Companies</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allUsers.map(u => (
                                    <tr key={u.id} className="clickable" onClick={() => loadUserCompanies(u.id)}>
                                        <td className="user-id">{u.id.substring(0, 20)}...</td>
                                        <td>
                                            <span className="count-badge">{u.companiesCount} companies</span>
                                        </td>
                                        <td className="actions">
                                            <button className="action-btn view" onClick={(e) => { e.stopPropagation(); loadUserCompanies(u.id); }}>
                                                <Eye size={16} /> View Companies
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Companies Tab */}
                {activeTab === 'companies' && !selectedUser && (
                    <div className="table-card full">
                        <h3><Building2 size={20} /> All Companies ({allCompanies.length})</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Company Name</th>
                                    <th>GSTIN</th>
                                    <th>Owner</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allCompanies.map(company => (
                                    <tr key={company.id} className="clickable" onClick={() => loadCompanyData(company)}>
                                        <td className="company-name">{company.name}</td>
                                        <td className="gstin">{company.gstin || '-'}</td>
                                        <td className="owner-id">{company.owner_id?.substring(0, 8) || 'N/A'}</td>
                                        <td className="created">{new Date(company.created_at).toLocaleDateString()}</td>
                                        <td className="actions">
                                            <button className="action-btn view"><Eye size={16} /></button>
                                            <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); deleteCompany(company.id); }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && !selectedUser && (
                    <div className="settings-page">
                        <div className="settings-card large">
                            <h3><Settings size={20} /> Application Settings</h3>
                            <div className="settings-form">
                                <div className="form-group">
                                    <label>Windows App Download URL</label>
                                    <input type="url" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} placeholder="https://github.com/..." />
                                    <small>This URL will be shown to users on the onboarding page</small>
                                </div>
                                <div className="form-group">
                                    <label>Current App Version</label>
                                    <input type="text" value={appVersion} onChange={(e) => setAppVersion(e.target.value)} placeholder="1.0.0" />
                                </div>
                                <button className="save-btn" onClick={saveSettings} disabled={saving}>
                                    <Save size={18} />
                                    {saving ? 'Saving...' : 'Save Settings'}
                                </button>
                            </div>
                        </div>

                        <div className="settings-card large">
                            <h3><Shield size={20} /> Admin Users</h3>
                            <div className="admin-list">
                                {ADMIN_EMAILS.map(email => (
                                    <div key={email} className="admin-item">
                                        <span className="email">{email}</span>
                                        <span className="role-badge">Super Admin</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <style>{`
                .admin-page {
                    display: flex;
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
                    color: white;
                }
                
                .access-denied {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    gap: 20px;
                    color: #ef4444;
                }

                .back-btn {
                    background: rgba(255,255,255,0.1);
                    border: none;
                    color: white;
                    padding: 8px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin-right: 12px;
                }
                
                /* Sidebar */
                .admin-sidebar {
                    width: 260px;
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(20px);
                    border-right: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    flex-direction: column;
                    padding: 24px;
                }
                
                .sidebar-logo {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 40px;
                    color: #a78bfa;
                }
                
                .sidebar-logo span { font-size: 1.2rem; font-weight: 700; }
                .sidebar-logo small {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    margin-left: auto;
                }
                
                .sidebar-nav { display: flex; flex-direction: column; gap: 8px; flex: 1; }
                
                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    border-radius: 10px;
                    background: transparent;
                    border: none;
                    color: #9ca3af;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                }
                
                .nav-item:hover { background: rgba(255, 255, 255, 0.05); color: white; }
                .nav-item.active { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
                
                .sidebar-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .admin-info { display: flex; flex-direction: column; gap: 4px; }
                .admin-badge { font-size: 0.7rem; background: linear-gradient(135deg, #10b981, #059669); padding: 2px 8px; border-radius: 4px; width: fit-content; }
                .admin-email { font-size: 0.75rem; color: #9ca3af; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
                
                .logout-btn {
                    padding: 10px;
                    background: rgba(239, 68, 68, 0.2);
                    border: none;
                    border-radius: 10px;
                    color: #ef4444;
                    cursor: pointer;
                }
                
                /* Main Content */
                .admin-main { flex: 1; padding: 30px; overflow-y: auto; }
                
                .admin-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 30px;
                }
                
                .admin-header h1 {
                    font-size: 1.8rem;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                }
                
                .admin-header p { color: #9ca3af; }
                
                .refresh-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 10px;
                    color: white;
                    cursor: pointer;
                }
                
                .spinning { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                
                /* Stats Grid */
                .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
                
                .stat-card {
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 24px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                
                .stat-icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
                .stat-icon.users { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
                .stat-icon.companies { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
                .stat-icon.syncs { background: linear-gradient(135deg, #10b981, #047857); }
                .stat-icon.pending { background: linear-gradient(135deg, #f59e0b, #d97706); }
                
                .stat-label { display: block; font-size: 0.85rem; color: #9ca3af; margin-bottom: 4px; }
                .stat-value { font-size: 1.8rem; font-weight: 700; }
                
                /* Settings Card */
                .settings-card {
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 30px;
                }
                
                .settings-card h3 { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: 1.1rem; }
                .settings-form { display: flex; gap: 20px; align-items: flex-end; flex-wrap: wrap; }
                .settings-card.large .settings-form { flex-direction: column; align-items: stretch; }
                
                .form-group { flex: 1; min-width: 200px; }
                .form-group label { display: block; font-size: 0.85rem; color: #9ca3af; margin-bottom: 8px; }
                .form-group input {
                    width: 100%;
                    padding: 12px 16px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    color: white;
                    font-size: 1rem;
                }
                .form-group small { display: block; margin-top: 8px; color: #6b7280; font-size: 0.8rem; }
                
                .save-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border: none;
                    border-radius: 10px;
                    color: white;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                }
                .save-btn:hover { transform: translateY(-2px); }
                
                /* Table Card */
                .table-card {
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 24px;
                    overflow: hidden;
                }
                .table-card.full { margin-top: 20px; }
                .table-card h3 { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: 1.1rem; }
                
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; padding: 12px; font-size: 0.8rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
                td { padding: 16px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
                
                tr.clickable { cursor: pointer; transition: background 0.2s; }
                tr.clickable:hover { background: rgba(255, 255, 255, 0.05); }
                
                .company-name, .user-id { font-weight: 600; }
                .owner-id, .gstin, .created { color: #9ca3af; font-size: 0.9rem; }
                
                .count-badge {
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.8rem;
                }
                
                .actions { display: flex; gap: 8px; }
                .action-btn {
                    padding: 8px 12px;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8rem;
                }
                .action-btn.view { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
                .action-btn.delete { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
                .action-btn:hover { transform: scale(1.05); }
                
                /* Settings Page */
                .settings-page { display: flex; flex-direction: column; gap: 20px; }
                .admin-list { display: flex; flex-direction: column; gap: 12px; }
                .admin-item { display: flex; align-items: center; justify-content: space-between; padding: 16px; background: rgba(0, 0, 0, 0.2); border-radius: 10px; }
                .role-badge { background: linear-gradient(135deg, #10b981, #059669); padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; }
                
                /* Modal Styles */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                }
                
                .loading-modal {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 20px;
                    text-align: center;
                    color: white;
                }
                
                .modal-content {
                    background: linear-gradient(135deg, #1a1a2e, #16213e);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    max-width: 1000px;
                    width: 100%;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    padding: 24px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .modal-header h2 { margin: 0 0 8px 0; }
                .modal-header p { margin: 0; color: #9ca3af; font-size: 0.9rem; }
                
                .close-btn {
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    color: white;
                    padding: 10px;
                    border-radius: 10px;
                    cursor: pointer;
                }
                
                .company-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 16px;
                    padding: 24px;
                }
                
                .company-stat {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 12px;
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .company-stat .stat-label { font-size: 0.75rem; color: #9ca3af; margin-bottom: 4px; }
                .company-stat .stat-value { font-size: 1.1rem; font-weight: 700; }
                .company-stat .stat-value.green { color: #10b981; }
                .company-stat .stat-value.orange { color: #f59e0b; }
                
                .data-tabs {
                    display: flex;
                    gap: 8px;
                    padding: 0 24px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .data-tabs button {
                    padding: 12px 20px;
                    background: transparent;
                    border: none;
                    color: #9ca3af;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }
                
                .data-tabs button.active {
                    color: white;
                    border-bottom-color: #8b5cf6;
                }
                
                .data-content { padding: 24px; min-height: 300px; }
                
                .overview-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
                .overview-card {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 12px;
                    padding: 24px;
                    text-align: center;
                }
                .overview-card h4 { margin: 0 0 12px 0; color: #9ca3af; font-size: 0.9rem; }
                .overview-card .big-number { font-size: 2rem; font-weight: 700; color: #8b5cf6; }
                
                .data-table { overflow-x: auto; }
                .data-table table { min-width: 600px; }
                
                .type-badge {
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                }
                .type-badge.sales { background: rgba(16, 185, 129, 0.2); color: #10b981; }
                .type-badge.purchase { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
                .type-badge.receipt { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
                .type-badge.payment { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
                
                td.green { color: #10b981; }
                td.red { color: #ef4444; }
                
                .modal-footer {
                    padding: 24px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    justify-content: flex-end;
                }
                
                .delete-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 10px;
                    color: #ef4444;
                    cursor: pointer;
                }
                
                @media (max-width: 1024px) {
                    .stats-grid { grid-template-columns: repeat(2, 1fr); }
                    .company-stats-grid { grid-template-columns: repeat(3, 1fr); }
                }
                
                @media (max-width: 768px) {
                    .admin-sidebar { display: none; }
                    .stats-grid { grid-template-columns: 1fr; }
                    .company-stats-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
};

export default AdminDashboardPage;
