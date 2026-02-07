import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import {
    Plus, Receipt, Users, Package, TrendingUp,
    ArrowRight, ShoppingBag, History, AlertCircle
} from 'lucide-react';
import { Card, Button, Avatar, Badge, EmptyState } from '@/components/ui/GlassUI';
import { format } from 'date-fns';

export default function BillingDashboard() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [todayStats, setTodayStats] = useState({ amount: 0, count: 0 });
    const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
    const [lowStock, setLowStock] = useState<any[]>([]);

    useEffect(() => {
        if (selectedCompany) {
            loadStats();
        }
    }, [selectedCompany]);

    const loadStats = async () => {
        setLoading(true);
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Fetch today's sales from vouchers
            const { data: sales } = await supabase
                .from('vouchers')
                .select('total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .gte('voucher_date', format(today, 'yyyy-MM-dd'));

            const total = sales?.reduce((acc: number, sale: any) => acc + Math.abs(Number(sale.grand_total) || Number(sale.total_amount) || 0), 0) || 0;
            setTodayStats({
                amount: total,
                count: sales?.length || 0
            });

            // Recent Invoices (Sales vouchers)
            const { data: recent } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: false })
                .limit(5);

            setRecentInvoices(recent || []);

            // Low Stock
            const { data: stock } = await supabase
                .from('stock_items')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .lt('current_stock', 10)
                .limit(4);

            setLowStock(stock || []);

        } catch (error) {
            console.error('Error loading billing stats:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* Quick Stats Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card glass className="relative overflow-hidden group border-none">
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] opacity-10 group-hover:opacity-20 transition-opacity" />
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[10px] font-black text-[var(--primary)] uppercase tracking-widest">Today's Revenue</p>
                            <ShoppingBag size={16} className="text-[var(--primary)]" />
                        </div>
                        <h2 className="text-3xl font-black text-[var(--on-surface)] mb-2">{formatCurrency(todayStats.amount)}</h2>
                        <Badge variant="success" className="bg-[var(--success)]/10 text-[var(--success)] border-none">
                            {todayStats.count} Invoices
                        </Badge>
                    </div>
                </Card>

                <Card glass className="flex flex-col justify-between hover:border-[var(--primary)] transition-all cursor-pointer group" onClick={() => navigate('/create-invoice')}>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] border border-[var(--primary)]/20 group-hover:bg-[var(--primary)] group-hover:text-white transition-all">
                            <Plus size={24} />
                        </div>
                        <div>
                            <h3 className="font-black text-[var(--on-surface)] text-sm uppercase tracking-tight">Create Invoice</h3>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">Quick Billing</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-[var(--primary)] uppercase tracking-widest">New Sale</span>
                        <ArrowRight size={14} className="text-[var(--primary)] group-hover:translate-x-1 transition-transform" />
                    </div>
                </Card>

                <Card glass className="cursor-pointer group hover:border-[var(--info)] transition-all" onClick={() => navigate('/ledgers')}>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--info)]/10 flex items-center justify-center text-[var(--info)] border border-[var(--info)]/20 group-hover:bg-[var(--info)] group-hover:text-white transition-all">
                            <Users size={24} />
                        </div>
                        <div>
                            <h3 className="font-black text-[var(--on-surface)] text-sm uppercase tracking-tight">Parties</h3>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">Manage Leads</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-[var(--info)] uppercase tracking-widest">Directory</span>
                        <ArrowRight size={14} className="text-[var(--info)] group-hover:translate-x-1 transition-transform" />
                    </div>
                </Card>

                <Card glass className="cursor-pointer group hover:border-[var(--warning)] transition-all" onClick={() => navigate('/stock')}>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--warning)]/10 flex items-center justify-center text-[var(--warning)] border border-[var(--warning)]/20 group-hover:bg-[var(--warning)] group-hover:text-white transition-all">
                            <Package size={24} />
                        </div>
                        <div>
                            <h3 className="font-black text-[var(--on-surface)] text-sm uppercase tracking-tight">Inventory</h3>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">Stock Items</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-[var(--warning)] uppercase tracking-widest">Warehouse</span>
                        <ArrowRight size={14} className="text-[var(--warning)] group-hover:translate-x-1 transition-transform" />
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Invoices */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-xl font-black text-[var(--on-surface)] flex items-center gap-2 tracking-tight">
                            <History size={20} className="text-[var(--primary)]" />
                            Stream Activity
                        </h2>
                        <Link to="/sales" className="text-xs font-black text-[var(--primary)] uppercase tracking-widest hover:underline underline-offset-4 transition-all">Historical View</Link>
                    </div>
                    <Card padding="none" className="overflow-hidden bg-transparent border-[var(--border)]">
                        {recentInvoices.length === 0 ? (
                            <EmptyState icon={<Receipt />} title="Zero Activity Found" />
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {recentInvoices.map((inv) => (
                                    <Link key={inv.id} to={`/vouchers/${inv.id}`} className="block hover:bg-[var(--surface-variant)] transition-all group">
                                        <div className="flex items-center justify-between p-5">
                                            <div className="flex items-center gap-4">
                                                <Avatar name={inv.party_name || 'Unknown'} size="sm" />
                                                <div>
                                                    <p className="text-sm font-black text-[var(--on-surface)] tracking-tight group-hover:text-[var(--primary)] transition-colors">{inv.party_name || 'Unknown Party'}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-widest leading-none mt-1.5 opacity-80">
                                                        #{inv.voucher_number} • {format(new Date(inv.voucher_date), 'd MMM, yyyy')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-[var(--on-surface)]">{formatCurrency(Math.abs(Number(inv.grand_total) || Number(inv.total_amount) || 0))}</p>
                                                <Badge variant="success" className="mt-1 bg-[var(--success-bg)] text-[var(--success)] border-none text-[8px] px-1.5 py-0">
                                                    SYNCED
                                                </Badge>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Stock Alerts & Insights */}
                <div className="space-y-6">
                    <h2 className="text-xl font-black text-[var(--on-surface)] flex items-center gap-2 tracking-tight px-2">
                        <AlertCircle size={20} className="text-[var(--error)]" />
                        Critical Alerts
                    </h2>
                    <Card className="bg-[var(--error-bg)] border-[var(--error)]/20 shadow-none">
                        {lowStock.length === 0 ? (
                            <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest italic text-center py-4">Inventory is optimized.</p>
                        ) : (
                            <div className="space-y-5">
                                {lowStock.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between group">
                                        <div>
                                            <p className="text-sm font-black text-[var(--on-surface)] tracking-tight">{item.name}</p>
                                            <p className="text-[10px] text-[var(--error)] font-black uppercase tracking-widest mt-0.5">Only {item.current_stock} {item.unit} left</p>
                                        </div>
                                        <Button size="sm" className="bg-[var(--error)]/10 text-[var(--error)] border-[var(--error)]/20 hover:bg-[var(--error)] hover:text-white transition-all text-[10px] font-black uppercase tracking-widest px-3 py-1.5 h-auto" onClick={() => navigate('/stock')}>
                                            RESTOCK
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button className="w-full mt-6 py-3.5 rounded-xl bg-[var(--surface)] text-[9px] font-black text-[var(--on-surface)] hover:bg-[var(--surface-active)] transition-all uppercase tracking-[2px] border border-[var(--border)] shadow-sm">
                            Analyze Supply Chain
                        </button>
                    </Card>

                    {/* Quick Access Card */}
                    <Card glass className="relative shadow-2xl overflow-hidden border-none">
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] opacity-10" />
                        <div className="relative z-10">
                            <h4 className="font-black text-[var(--on-surface)] text-sm uppercase tracking-tight mb-2">Compliance Hub</h4>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">GSTR-1 filing due in 3 days.</p>
                            <Button className="w-full bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white border-0 shadow-lg shadow-[var(--primary-glow)] font-black uppercase tracking-widest text-[10px] py-4 h-auto rounded-xl">
                                INITIATE FILING
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
