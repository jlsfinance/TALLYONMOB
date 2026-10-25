import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import toast from 'react-hot-toast';
import {
    Plus, Trash2, GripVertical, Save, Eye, EyeOff, Settings,
    BarChart3, PieChart, TrendingUp, IndianRupee, Users, Package,
    FileText, Activity, RefreshCw, X, Check
} from 'lucide-react';

interface Widget {
    id: string;
    type: 'kpi' | 'chart' | 'table' | 'list';
    title: string;
    metric: string;
    size: 'sm' | 'md' | 'lg';
    visible: boolean;
}

const AVAILABLE_METRICS = [
    { key: 'total_sales', label: 'Total Sales', icon: <TrendingUp size={14} />, color: 'text-blue-400' },
    { key: 'total_purchases', label: 'Total Purchases', icon: <IndianRupee size={14} />, color: 'text-emerald-400' },
    { key: 'receivables', label: 'Receivables', icon: <IndianRupee size={14} />, color: 'text-amber-400' },
    { key: 'payables', label: 'Payables', icon: <IndianRupee size={14} />, color: 'text-red-400' },
    { key: 'voucher_count', label: 'Voucher Count', icon: <FileText size={14} />, color: 'text-purple-400' },
    { key: 'party_count', label: 'Active Parties', icon: <Users size={14} />, color: 'text-cyan-400' },
    { key: 'stock_value', label: 'Stock Value', icon: <Package size={14} />, color: 'text-orange-400' },
    { key: 'profit_margin', label: 'Profit Margin', icon: <BarChart3 size={14} />, color: 'text-green-400' },
    { key: 'daily_sales', label: "Today's Sales", icon: <Activity size={14} />, color: 'text-blue-400' },
    { key: 'monthly_growth', label: 'Monthly Growth', icon: <TrendingUp size={14} />, color: 'text-emerald-400' },
];

const WIDGET_TYPES = [
    { key: 'kpi', label: 'KPI Card', icon: <IndianRupee size={14} /> },
    { key: 'chart', label: 'Chart', icon: <BarChart3 size={14} /> },
    { key: 'table', label: 'Table', icon: <FileText size={14} /> },
    { key: 'list', label: 'List', icon: <Users size={14} /> },
];

export default function CustomDashboardBuilderPage() {
    const { selectedCompany } = useAuth() as any;
    const [widgets, setWidgets] = useState<Widget[]>([
        { id: '1', type: 'kpi', title: 'Total Sales', metric: 'total_sales', size: 'sm', visible: true },
        { id: '2', type: 'kpi', title: 'Total Purchases', metric: 'total_purchases', size: 'sm', visible: true },
        { id: '3', type: 'kpi', title: 'Receivables', metric: 'receivables', size: 'sm', visible: true },
        { id: '4', type: 'kpi', title: 'Payables', metric: 'payables', size: 'sm', visible: true },
    ]);
    const [editingWidget, setEditingWidget] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [draggedWidget, setDraggedWidget] = useState<string | null>(null);

    const addWidget = () => {
        const newWidget: Widget = {
            id: Date.now().toString(),
            type: 'kpi',
            title: 'New Widget',
            metric: 'total_sales',
            size: 'sm',
            visible: true,
        };
        setWidgets([...widgets, newWidget]);
        setEditingWidget(newWidget.id);
    };

    const updateWidget = (id: string, updates: Partial<Widget>) => {
        setWidgets(widgets.map(w => w.id === id ? { ...w, ...updates } : w));
    };

    const removeWidget = (id: string) => {
        setWidgets(widgets.filter(w => w.id !== id));
        if (editingWidget === id) setEditingWidget(null);
    };

    const handleDragStart = (id: string) => setDraggedWidget(id);
    const handleDragOver = (e: React.DragEvent) => e.preventDefault();
    const handleDrop = (targetId: string) => {
        if (!draggedWidget || draggedWidget === targetId) return;
        const fromIdx = widgets.findIndex(w => w.id === draggedWidget);
        const toIdx = widgets.findIndex(w => w.id === targetId);
        const newWidgets = [...widgets];
        const [moved] = newWidgets.splice(fromIdx, 1);
        newWidgets.splice(toIdx, 0, moved);
        setWidgets(newWidgets);
        setDraggedWidget(null);
    };

    const saveLayout = async () => {
        if (!selectedCompany?.id) return;
        try {
            await supabase.from('company_settings').upsert({
                company_id: selectedCompany.id,
                key: 'custom_dashboard_layout',
                value: JSON.stringify(widgets),
            }, { onConflict: 'company_id,key' });
            toast.success('Dashboard layout saved!');
        } catch {
            toast.success('Layout saved locally');
            localStorage.setItem(`dashboard_layout_${selectedCompany.id}`, JSON.stringify(widgets));
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)]">Custom Dashboard Builder</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Drag-and-drop to build your perfect dashboard</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface-variant)] text-xs font-bold border border-[var(--border)]">
                        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                        {showPreview ? 'Edit' : 'Preview'}
                    </button>
                    <button onClick={saveLayout} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold">
                        <Save size={14} /> Save Layout
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Widget Palette */}
                {!showPreview && (
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Add Widgets</h3>
                        <div className="space-y-2">
                            {WIDGET_TYPES.map(wt => (
                                <button key={wt.key} onClick={() => {
                                    const newWidget: Widget = { id: Date.now().toString(), type: wt.key as any, title: wt.label, metric: 'total_sales', size: 'sm', visible: true };
                                    setWidgets([...widgets, newWidget]);
                                }} className="w-full flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] hover:border-[var(--primary)] transition-all text-left">
                                    {wt.icon}
                                    <span className="text-xs font-bold">{wt.label}</span>
                                    <Plus size={14} className="ml-auto text-[var(--text-muted)]" />
                                </button>
                            ))}
                        </div>

                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] pt-4">Widget List</h3>
                        <div className="space-y-1">
                            {widgets.map(w => (
                                <div key={w.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-all ${editingWidget === w.id ? 'bg-[var(--primary)]/10 border border-[var(--primary)]/30' : 'hover:bg-[var(--surface-variant)]'}`} onClick={() => setEditingWidget(w.id)}>
                                    <GripVertical size={12} className="text-[var(--text-muted)] cursor-grab" />
                                    <span className="flex-1 truncate font-bold">{w.title}</span>
                                    <button onClick={(e) => { e.stopPropagation(); removeWidget(w.id); }} className="text-red-400 hover:text-red-500">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Widget Editor / Preview */}
                <div className={`lg:col-span-${showPreview ? '4' : '3'} space-y-4`}>
                    {editingWidget && !showPreview ? (
                        <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold">Edit Widget</h3>
                                <button onClick={() => setEditingWidget(null)} className="text-[var(--text-muted)]"><X size={16} /></button>
                            </div>
                            {(() => {
                                const widget = widgets.find(w => w.id === editingWidget);
                                if (!widget) return null;
                                return (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Title</label>
                                            <input value={widget.title} onChange={e => updateWidget(widget.id, { title: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Metric</label>
                                            <select value={widget.metric} onChange={e => updateWidget(widget.id, { metric: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs">
                                                {AVAILABLE_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Size</label>
                                            <div className="flex gap-2 mt-1">
                                                {(['sm', 'md', 'lg'] as const).map(s => (
                                                    <button key={s} onClick={() => updateWidget(widget.id, { size: s })} className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase ${widget.size === s ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-variant)] border border-[var(--border)]'}`}>{s}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Visible</label>
                                            <button onClick={() => updateWidget(widget.id, { visible: !widget.visible })} className={`w-10 h-5 rounded-full transition-all ${widget.visible ? 'bg-[var(--primary)]' : 'bg-[var(--surface-variant)]'}`}>
                                                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${widget.visible ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    ) : null}

                    {/* Dashboard Preview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {widgets.filter(w => w.visible).map(w => {
                            const metric = AVAILABLE_METRICS.find(m => m.key === w.metric);
                            return (
                                <div key={w.id} draggable onDragStart={() => handleDragStart(w.id)} onDragOver={handleDragOver} onDrop={() => handleDrop(w.id)} className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 cursor-grab hover:shadow-lg transition-all ${w.size === 'lg' ? 'col-span-2' : w.size === 'md' ? 'col-span-2 md:col-span-2' : ''}`}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className={metric?.color || 'text-[var(--primary)]'}>{metric?.icon}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{w.title}</span>
                                    </div>
                                    <p className="text-2xl font-black text-[var(--on-surface)]">--</p>
                                    <p className="text-[10px] text-[var(--text-muted)] mt-1">Connect data to display</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
