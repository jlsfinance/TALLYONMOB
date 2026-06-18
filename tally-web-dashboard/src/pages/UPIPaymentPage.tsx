import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Copy,
  Share2,
  Download,
  Printer,
  Filter,
  Search,
  Plus,
  Link2,
  QrCode,
  Settings,
  Send,
  AlertCircle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  ChevronDown,
  ChevronRight,
  FileText,
  Building2,
  CheckSquare,
  MessageSquare,
  Mail,
  Phone,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import supabase from '@/lib/insforge';

type TransactionStatus = 'success' | 'pending' | 'failed' | 'refunded';
type FilterStatus = 'all' | TransactionStatus;
type TabType = 'dashboard' | 'generate' | 'transactions' | 'reconcile' | 'qr' | 'settings';

interface PaymentLink {
  id: string;
  amount: number;
  party_name: string;
  description: string;
  upi_id: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  company_id: string;
}

interface UnmatchedPayment {
  id: string;
  transactionId: string;
  amount: number;
  party: string;
  date: Date;
  suggestedInvoice?: string;
}

interface PaymentSettings {
  upiId: string;
  businessName: string;
  autoReconcile: boolean;
  reminderSchedule: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  whatsappNotifications: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const UPIPaymentPage: React.FC = () => {
  const { selectedCompany } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    party: '',
    description: '',
    expiry: '24hours',
  });

  const [qrAmount, setQrAmount] = useState('');

  const [settings, setSettings] = useState<PaymentSettings>({
    upiId: 'business@paytm',
    businessName: 'My Business Pvt Ltd',
    autoReconcile: true,
    reminderSchedule: '24hours',
    emailNotifications: true,
    smsNotifications: false,
    whatsappNotifications: true,
  });

  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const fetchPaymentLinks = useCallback(async () => {
    if (!selectedCompany?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_links')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch payment links:', error);
        toast.error('Failed to load payment data');
        return;
      }
      setPaymentLinks(data || []);
    } catch (err) {
      console.error('Unexpected error fetching payment links:', err);
      toast.error('Failed to load payment data');
    } finally {
      setLoading(false);
    }
  }, [selectedCompany?.id]);

  useEffect(() => {
    fetchPaymentLinks();
  }, [fetchPaymentLinks]);

  const dashboardStats = useMemo(() => {
    const success = paymentLinks.filter((p) => p.status === 'paid');
    const pending = paymentLinks.filter((p) => p.status === 'active');
    const failed = paymentLinks.filter((p) => p.status === 'failed');
    const totalCollections = success.reduce((sum, p) => sum + Number(p.amount), 0);
    const avgValue = success.length > 0 ? totalCollections / success.length : 0;
    const total = paymentLinks.length;
    const successRate = total > 0 ? (success.length / total) * 100 : 0;

    return {
      totalCollections,
      totalTransactions: total,
      successRate,
      pendingCount: pending.length,
      failedCount: failed.length,
      avgValue,
    };
  }, [paymentLinks]);

  const filteredTransactions = useMemo(() => {
    return paymentLinks.filter((t) => {
      if (filterStatus !== 'all') {
        if (filterStatus === 'success' && t.status !== 'paid') return false;
        if (filterStatus === 'pending' && t.status !== 'active') return false;
        if (filterStatus === 'failed' && t.status !== 'failed') return false;
        if (filterStatus === 'refunded' && t.status !== 'refunded') return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !t.id.toLowerCase().includes(query) &&
          !t.party_name.toLowerCase().includes(query) &&
          !(t.description || '').toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      if (dateRange.start && t.created_at < dateRange.start) return false;
      if (dateRange.end && t.created_at > dateRange.end + 'T23:59:59') return false;
      return true;
    });
  }, [paymentLinks, filterStatus, searchQuery, dateRange]);

  const unmatchedPayments = useMemo<UnmatchedPayment[]>(() => {
    return paymentLinks
      .filter((p) => p.status === 'active')
      .map((p) => ({
        id: p.id,
        transactionId: p.id,
        amount: Number(p.amount),
        party: p.party_name,
        date: new Date(p.created_at),
      }));
  }, [paymentLinks]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
      case 'success':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'active':
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'refunded':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  const getDisplayStatus = (status: string): string => {
    if (status === 'paid') return 'Success';
    if (status === 'active') return 'Pending';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const generatePaymentLink = async () => {
    if (!paymentForm.amount || !paymentForm.party) {
      toast.error('Please enter amount and party name');
      return;
    }
    if (!selectedCompany?.id) {
      toast.error('No company selected');
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase.from('payment_links').insert({
        company_id: selectedCompany.id,
        party_name: paymentForm.party,
        amount: Number(paymentForm.amount),
        upi_id: settings.upiId,
        description: paymentForm.description,
        status: 'active',
      });

      if (error) {
        console.error('Failed to create payment link:', error);
        toast.error('Failed to generate payment link');
        return;
      }

      setPaymentForm({ amount: '', party: '', description: '', expiry: '24hours' });
      toast.success('Payment link generated!');
      await fetchPaymentLinks();
    } catch (err) {
      console.error('Unexpected error creating payment link:', err);
      toast.error('Failed to generate payment link');
    } finally {
      setCreating(false);
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      const { error } = await supabase
        .from('payment_links')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('Failed to mark as paid:', error);
        toast.error('Failed to record payment');
        return;
      }

      toast.success('Payment recorded successfully!');
      await fetchPaymentLinks();
    } catch (err) {
      console.error('Unexpected error marking as paid:', err);
      toast.error('Failed to record payment');
    }
  };

  const markAsFailed = async (id: string) => {
    try {
      const { error } = await supabase
        .from('payment_links')
        .update({ status: 'failed' })
        .eq('id', id);

      if (error) {
        console.error('Failed to mark as failed:', error);
        toast.error('Failed to update status');
        return;
      }

      toast.success('Payment marked as failed');
      await fetchPaymentLinks();
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Failed to update status');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const exportToCSV = () => {
    const headers = ['Date', 'ID', 'Party', 'Amount', 'Status', 'Description'];
    const rows = filteredTransactions.map((t) => [
      format(new Date(t.created_at), 'dd/MM/yyyy HH:mm'),
      t.id,
      t.party_name,
      t.amount.toString(),
      t.status,
      t.description || 'N/A',
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upi-transactions-${format(new Date(), 'dd-MM-yyyy')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully!');
  };

  const handleReconcile = async () => {
    if (!selectedPayment || !selectedInvoice) {
      toast.error('Please select both payment and invoice');
      return;
    }
    await markAsPaid(selectedPayment);
    setSelectedPayment(null);
    setSelectedInvoice(null);
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <TrendingUp size={18} /> },
    { id: 'generate', label: 'Generate Link', icon: <Link2 size={18} /> },
    { id: 'transactions', label: 'Transactions', icon: <CreditCard size={18} /> },
    { id: 'reconcile', label: 'Reconcile', icon: <RefreshCw size={18} /> },
    { id: 'qr', label: 'QR Code', icon: <QrCode size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  const renderDashboard = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">Total UPI Collections</span>
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <ArrowUpRight className="text-cyan-400" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{formatCurrency(dashboardStats.totalCollections)}</p>
          <p className="text-green-400 text-sm mt-1">From paid payments</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">Total Transactions</span>
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <CreditCard className="text-purple-400" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{dashboardStats.totalTransactions}</p>
          <p className="text-zinc-400 text-sm mt-1">Across all statuses</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">Success Rate</span>
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="text-green-400" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{dashboardStats.successRate.toFixed(1)}%</p>
          <div className="mt-2 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${dashboardStats.successRate}%` }}
            />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">Pending Collections</span>
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <Clock className="text-yellow-400" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{dashboardStats.pendingCount}</p>
          <p className="text-yellow-400 text-sm mt-1">Awaiting confirmation</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">Failed Transactions</span>
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <XCircle className="text-red-400" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{dashboardStats.failedCount}</p>
          <p className="text-red-400 text-sm mt-1">Requires attention</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">Avg Transaction Value</span>
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <TrendingUp className="text-cyan-400" size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{formatCurrency(dashboardStats.avgValue)}</p>
          <p className="text-zinc-400 text-sm mt-1">Per successful transaction</p>
        </motion.div>
      </div>

      <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Recent Transactions</h3>
        <div className="space-y-3">
          {paymentLinks.slice(0, 5).map((txn) => (
            <div key={txn.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    txn.status === 'paid'
                      ? 'bg-green-500/20'
                      : txn.status === 'active'
                      ? 'bg-yellow-500/20'
                      : 'bg-red-500/20'
                  }`}
                >
                  {txn.status === 'paid' ? (
                    <CheckCircle2 className="text-green-400" size={18} />
                  ) : txn.status === 'active' ? (
                    <Clock className="text-yellow-400" size={18} />
                  ) : (
                    <XCircle className="text-red-400" size={18} />
                  )}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{txn.party_name}</p>
                  <p className="text-zinc-400 text-xs">{txn.id.slice(0, 12)}...</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-semibold">{formatCurrency(Number(txn.amount))}</p>
                <p className="text-zinc-400 text-xs">{format(new Date(txn.created_at), 'dd MMM, HH:mm')}</p>
              </div>
            </div>
          ))}
          {paymentLinks.length === 0 && (
            <div className="text-center py-8">
              <p className="text-zinc-400">No transactions yet</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  const renderGenerateLink = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-6 flex items-center gap-2">
          <Link2 size={20} className="text-cyan-400" />
          Generate Payment Link
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-5">
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Amount (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">₹</span>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="Enter amount"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 text-sm mb-2">Party Name / Invoice Reference</label>
              <input
                type="text"
                value={paymentForm.party}
                onChange={(e) => setPaymentForm({ ...paymentForm, party: e.target.value })}
                placeholder="Enter party name or invoice number"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-zinc-400 text-sm mb-2">Description / Notes</label>
              <textarea
                value={paymentForm.description}
                onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })}
                placeholder="Payment for..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-zinc-400 text-sm mb-2">Expiry</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: '1hour', label: '1 Hour' },
                  { value: '24hours', label: '24 Hours' },
                  { value: '7days', label: '7 Days' },
                  { value: 'custom', label: 'Custom' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setPaymentForm({ ...paymentForm, expiry: option.value })}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      paymentForm.expiry === option.value
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
              <p className="text-zinc-400 text-sm mb-1">Receiving UPI ID</p>
              <p className="text-cyan-400 font-mono font-semibold">{settings.upiId}</p>
            </div>

            <button
              onClick={generatePaymentLink}
              disabled={creating}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {creating ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Plus size={18} />
              )}
              {creating ? 'Generating...' : 'Generate Payment Link'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700/50">
              <h4 className="text-white font-medium mb-4">Payment Link Preview</h4>
              <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-3">
                    <Smartphone className="text-green-400" size={28} />
                  </div>
                  <p className="text-white font-semibold">{settings.businessName}</p>
                  <p className="text-cyan-400 text-sm font-mono">{settings.upiId}</p>
                </div>
                {paymentForm.amount && (
                  <div className="text-center py-4 border-t border-zinc-700">
                    <p className="text-zinc-400 text-sm">Amount</p>
                    <p className="text-3xl font-bold text-white">{formatCurrency(Number(paymentForm.amount))}</p>
                  </div>
                )}
                {paymentForm.description && (
                  <p className="text-zinc-400 text-sm text-center mt-2">{paymentForm.description}</p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => copyToClipboard(`upi://pay?pa=${settings.upiId}&am=${paymentForm.amount || '0'}`)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Copy size={14} /> Copy Link
                </button>
                <button className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
                  <MessageSquare size={14} /> WhatsApp
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
                  <Phone size={14} /> SMS
                </button>
                <button className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
                  <Mail size={14} /> Email
                </button>
              </div>
            </div>

            {paymentLinks.filter((l) => l.status === 'active').length > 0 && (
              <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
                <h4 className="text-white font-medium mb-3">Active Links</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {paymentLinks
                    .filter((l) => l.status === 'active')
                    .slice(0, 10)
                    .map((link) => (
                      <div key={link.id} className="bg-zinc-900 rounded-lg p-3 border border-zinc-700/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white text-sm font-medium">{link.party_name}</span>
                          <span className="text-cyan-400 font-semibold">{formatCurrency(Number(link.amount))}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-xs">{format(new Date(link.created_at), 'dd MMM, HH:mm')}</span>
                          <span className="text-green-400 text-xs bg-green-500/20 px-2 py-0.5 rounded">Active</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  const renderTransactions = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <CreditCard size={20} className="text-cyan-400" />
            UPI Transactions
          </h3>
          <div className="flex gap-2">
            <button
              onClick={fetchPaymentLinks}
              className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={exportToCSV}
              className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Party or ID..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>

            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="mx-auto text-zinc-600 mb-3 animate-spin" size={40} />
            <p className="text-zinc-400">Loading transactions...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-400 text-xs font-medium py-3 px-4">Date/Time</th>
                  <th className="text-left text-zinc-400 text-xs font-medium py-3 px-4">ID</th>
                  <th className="text-left text-zinc-400 text-xs font-medium py-3 px-4">Party</th>
                  <th className="text-left text-zinc-400 text-xs font-medium py-3 px-4">Amount</th>
                  <th className="text-left text-zinc-400 text-xs font-medium py-3 px-4">Status</th>
                  <th className="text-left text-zinc-400 text-xs font-medium py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((txn) => (
                  <tr key={txn.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4 text-zinc-300 text-sm">{format(new Date(txn.created_at), 'dd MMM yyyy, HH:mm')}</td>
                    <td className="py-3 px-4 text-cyan-400 text-sm font-mono">{txn.id.slice(0, 12)}...</td>
                    <td className="py-3 px-4 text-white text-sm">{txn.party_name}</td>
                    <td className="py-3 px-4 text-white text-sm font-semibold">{formatCurrency(Number(txn.amount))}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(txn.status)}`}>
                        {getDisplayStatus(txn.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {txn.status === 'active' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => markAsPaid(txn.id)}
                            className="text-green-400 hover:text-green-300 text-xs bg-green-500/10 px-2 py-1 rounded transition-colors"
                          >
                            Mark Paid
                          </button>
                          <button
                            onClick={() => markAsFailed(txn.id)}
                            className="text-red-400 hover:text-red-300 text-xs bg-red-500/10 px-2 py-1 rounded transition-colors"
                          >
                            Failed
                          </button>
                        </div>
                      )}
                      {txn.status === 'paid' && txn.paid_at && (
                        <span className="text-zinc-500 text-xs">{format(new Date(txn.paid_at), 'dd MMM, HH:mm')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto text-zinc-600 mb-3" size={40} />
            <p className="text-zinc-400">No transactions found</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );

  const renderReconcile = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-6 flex items-center gap-2">
          <RefreshCw size={20} className="text-cyan-400" />
          Payment Reconciliation
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-white font-medium mb-4 flex items-center gap-2">
              <AlertCircle size={16} className="text-yellow-400" />
              Pending Payments ({unmatchedPayments.length})
            </h4>
            <div className="space-y-3">
              {unmatchedPayments.map((payment) => (
                <div
                  key={payment.id}
                  className={`bg-zinc-800/50 rounded-lg p-4 border transition-all cursor-pointer ${
                    selectedPayment === payment.id
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                  onClick={() => setSelectedPayment(payment.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{payment.party}</span>
                    <span className="text-cyan-400 font-semibold">{formatCurrency(payment.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400 font-mono">{payment.transactionId.slice(0, 12)}...</span>
                    <span className="text-zinc-400">{format(payment.date, 'dd MMM')}</span>
                  </div>
                </div>
              ))}
              {unmatchedPayments.length === 0 && (
                <div className="text-center py-8 bg-zinc-800/30 rounded-lg">
                  <CheckCircle2 className="mx-auto text-green-400 mb-2" size={32} />
                  <p className="text-zinc-400 text-sm">All payments reconciled!</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4 flex items-center gap-2">
              <FileText size={16} className="text-cyan-400" />
              Quick Actions
            </h4>
            <div className="space-y-3">
              {selectedPayment && (
                <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
                  <p className="text-white font-medium mb-2">Mark Selected Payment</p>
                  <p className="text-zinc-400 text-sm mb-3">
                    Payment ID: {selectedPayment.slice(0, 12)}...
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        markAsPaid(selectedPayment);
                        setSelectedPayment(null);
                      }}
                      className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm py-2 rounded-lg flex items-center justify-center gap-2 transition-colors border border-green-500/30"
                    >
                      <CheckSquare size={14} />
                      Mark as Paid
                    </button>
                    <button
                      onClick={() => {
                        markAsFailed(selectedPayment);
                        setSelectedPayment(null);
                      }}
                      className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm py-2 rounded-lg flex items-center justify-center gap-2 transition-colors border border-red-500/30"
                    >
                      <XCircle size={14} />
                      Mark as Failed
                    </button>
                  </div>
                </div>
              )}
              {!selectedPayment && (
                <div className="text-center py-8 bg-zinc-800/30 rounded-lg">
                  <RefreshCw className="mx-auto text-zinc-500 mb-2" size={32} />
                  <p className="text-zinc-400 text-sm">Select a payment to reconcile</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  const renderQRCode = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-6 flex items-center gap-2">
          <QrCode size={20} className="text-cyan-400" />
          QR Code Display
        </h3>

        <div className="flex flex-col lg:flex-row gap-8 items-center justify-center">
          <div className="text-center">
            <div className="bg-white p-6 rounded-2xl inline-block mb-4">
              <div className="w-56 h-56 relative">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=224x224&data=upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.businessName)}${qrAmount ? `&am=${qrAmount}` : ''}`}
                  alt="UPI QR Code"
                  className="w-full h-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.qr-fallback')) {
                      const fallback = document.createElement('div');
                      fallback.className = 'qr-fallback absolute inset-0 grid grid-cols-11 grid-rows-11 gap-0.5';
                      for (let i = 0; i < 121; i++) {
                        const row = Math.floor(i / 11);
                        const col = i % 11;
                        const isCorner =
                          (row < 3 && col < 3) ||
                          (row < 3 && col > 7) ||
                          (row > 7 && col < 3);
                        const isData = !isCorner && Math.random() > 0.45;
                        const dot = document.createElement('div');
                        dot.className = `${isCorner || isData ? 'bg-zinc-900' : 'bg-white'} rounded-sm`;
                        fallback.appendChild(dot);
                      }
                      parent.appendChild(fallback);
                    }
                  }}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-zinc-400 text-sm mb-2">Fixed Amount (Optional)</label>
              <div className="relative max-w-xs mx-auto">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">₹</span>
                <input
                  type="number"
                  value={qrAmount}
                  onChange={(e) => setQrAmount(e.target.value)}
                  placeholder="Any amount"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => copyToClipboard(settings.upiId)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
              >
                <Copy size={16} /> Copy UPI ID
              </button>
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.businessName)}${qrAmount ? `&am=${qrAmount}` : ''}`;
                  link.download = 'upi-qr-code.png';
                  link.click();
                  toast.success('QR code downloaded!');
                }}
                className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors font-medium"
              >
                <Download size={16} /> Download QR
              </button>
            </div>
          </div>

          <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700/50 max-w-sm w-full">
            <div className="text-center mb-4">
              <Building2 className="mx-auto text-cyan-400 mb-2" size={32} />
              <p className="text-white font-semibold text-lg">{settings.businessName}</p>
            </div>

            <div className="bg-zinc-900 rounded-lg p-4 text-center mb-4">
              <p className="text-zinc-400 text-sm mb-1">UPI ID</p>
              <p className="text-cyan-400 font-mono font-bold text-lg">{settings.upiId}</p>
            </div>

            {qrAmount && (
              <div className="bg-green-500/10 rounded-lg p-4 text-center border border-green-500/20">
                <p className="text-zinc-400 text-sm mb-1">Amount</p>
                <p className="text-green-400 font-bold text-2xl">{formatCurrency(Number(qrAmount))}</p>
              </div>
            )}

            <p className="text-zinc-500 text-xs text-center mt-4">
              Scan to pay using any UPI app
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  const renderSettings = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-6 flex items-center gap-2">
          <Settings size={20} className="text-cyan-400" />
          Payment Settings
        </h3>

        <div className="space-y-6 max-w-2xl">
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Your UPI ID</label>
            <input
              type="text"
              value={settings.upiId}
              onChange={(e) => setSettings({ ...settings, upiId: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-sm mb-2">Business Name</label>
            <input
              type="text"
              value={settings.businessName}
              onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            <div>
              <p className="text-white font-medium">Auto-Reconciliation</p>
              <p className="text-zinc-400 text-sm">Automatically match payments with invoices</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, autoReconcile: !settings.autoReconcile })}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                settings.autoReconcile ? 'bg-cyan-500' : 'bg-zinc-700'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                  settings.autoReconcile ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-zinc-400 text-sm mb-2">Payment Reminder Schedule</label>
            <select
              value={settings.reminderSchedule}
              onChange={(e) => setSettings({ ...settings, reminderSchedule: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="1hour">1 Hour after due</option>
              <option value="24hours">24 Hours after due</option>
              <option value="3days">3 Days after due</option>
              <option value="7days">7 Days after due</option>
              <option value="never">Never</option>
            </select>
          </div>

          <div>
            <p className="text-white font-medium mb-3">Notification Preferences</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="text-zinc-400" size={18} />
                  <span className="text-zinc-300">Email Notifications</span>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, emailNotifications: !settings.emailNotifications })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    settings.emailNotifications ? 'bg-cyan-500' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      settings.emailNotifications ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Phone className="text-zinc-400" size={18} />
                  <span className="text-zinc-300">SMS Notifications</span>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, smsNotifications: !settings.smsNotifications })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    settings.smsNotifications ? 'bg-cyan-500' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      settings.smsNotifications ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <MessageSquare className="text-zinc-400" size={18} />
                  <span className="text-zinc-300">WhatsApp Notifications</span>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, whatsappNotifications: !settings.whatsappNotifications })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    settings.whatsappNotifications ? 'bg-cyan-500' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      settings.whatsappNotifications ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => toast.success('Settings saved successfully!')}
            className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            Save Settings
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'generate':
        return renderGenerateLink();
      case 'transactions':
        return renderTransactions();
      case 'reconcile':
        return renderReconcile();
      case 'qr':
        return renderQRCode();
      case 'settings':
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Smartphone className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">UPI Payment Collection</h1>
            <p className="text-zinc-400 text-sm">Manage UPI payments, generate links, and reconcile transactions</p>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default UPIPaymentPage;
