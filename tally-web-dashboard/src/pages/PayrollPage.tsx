import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
    Briefcase, Plus, Trash2, Search, IndianRupee, Users,
    Calculator, Download, CheckCircle, Clock, FileText, X
} from 'lucide-react';

interface Employee {
    id: string;
    name: string;
    employee_id: string;
    designation: string;
    department: string;
    basic_salary: number;
    hra: number;
    allowances: number;
    pf_deduction: number;
    esi_deduction: number;
    tds_deduction: number;
    other_deductions: number;
    bank_account: string;
    ifsc_code: string;
    pan_number: string;
    is_active: boolean;
}

interface Payslip {
    id: string;
    employee_id: string;
    employee_name: string;
    month: string;
    basic: number;
    hra: number;
    allowances: number;
    gross: number;
    pf: number;
    esi: number;
    tds: number;
    other_deductions: number;
    total_deductions: number;
    net_pay: number;
    status: string;
}

export default function PayrollPage() {
    const { selectedCompany } = useAuth() as any;
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'employees' | 'payslips' | 'process'>('employees');
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [form, setForm] = useState({ name: '', employee_id: '', designation: '', department: '', basic_salary: '', hra: '', allowances: '', bank_account: '', ifsc_code: '', pan_number: '' });

    useEffect(() => { if (selectedCompany?.id) { loadEmployees(); loadPayslips(); } }, [selectedCompany, selectedMonth]);

    const loadEmployees = async () => {
        setLoading(true);
        try {
            const { data } = await supabase.from('employees')
                .select('*').eq('company_id', selectedCompany.id).eq('is_active', true)
                .order('name');
            setEmployees((data || []) as Employee[]);
        } catch { }
        setLoading(false);
    };

    const loadPayslips = async () => {
        try {
            const { data } = await supabase.from('payslips')
                .select('*').eq('company_id', selectedCompany.id).eq('month', selectedMonth)
                .order('employee_name');
            setPayslips((data || []) as Payslip[]);
        } catch { }
    };

    const addEmployee = async () => {
        if (!form.name || !form.basic_salary) { toast.error('Fill required fields'); return; }
        const basic = parseFloat(form.basic_salary) || 0;
        const hra = parseFloat(form.hra) || Math.round(basic * 0.4);
        const allowances = parseFloat(form.allowances) || Math.round(basic * 0.2);
        try {
            const { error } = await supabase.from('employees').insert({
                company_id: selectedCompany.id, name: form.name, employee_id: form.employee_id,
                designation: form.designation, department: form.department, basic_salary: basic,
                hra, allowances, pf_deduction: Math.round(basic * 0.12), esi_deduction: basic > 21000 ? 0 : Math.round(basic * 0.0075),
                tds_deduction: 0, other_deductions: 0, bank_account: form.bank_account,
                ifsc_code: form.ifsc_code, pan_number: form.pan_number, is_active: true,
            });
            if (error) throw error;
            toast.success('Employee added!');
            setForm({ name: '', employee_id: '', designation: '', department: '', basic_salary: '', hra: '', allowances: '', bank_account: '', ifsc_code: '', pan_number: '' });
            setShowForm(false);
            loadEmployees();
        } catch (e: any) { toast.error(e.message); }
    };

    const processPayroll = async () => {
        if (employees.length === 0) { toast.error('No employees found'); return; }
        try {
            const newPayslips = employees.map(emp => {
                const gross = emp.basic_salary + emp.hra + emp.allowances;
                const totalDeductions = emp.pf_deduction + emp.esi_deduction + emp.tds_deduction + emp.other_deductions;
                return {
                    company_id: selectedCompany.id, employee_id: emp.id, employee_name: emp.name,
                    month: selectedMonth, basic: emp.basic_salary, hra: emp.hra, allowances: emp.allowances,
                    gross, pf: emp.pf_deduction, esi: emp.esi_deduction, tds: emp.tds_deduction,
                    other_deductions: emp.other_deductions, total_deductions: totalDeductions,
                    net_pay: gross - totalDeductions, status: 'draft',
                };
            });
            const { error } = await supabase.from('payslips').upsert(newPayslips, { onConflict: 'company_id,employee_id,month' });
            if (error) throw error;
            toast.success(`Payroll processed for ${employees.length} employees!`);
            loadPayslips();
        } catch (e: any) { toast.error(e.message); }
    };

    const filtered = employees.filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.employee_id?.toLowerCase().includes(search.toLowerCase()));
    const formatCurrency = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
    const totalGross = payslips.reduce((s, p) => s + p.gross, 0);
    const totalDeductions = payslips.reduce((s, p) => s + p.total_deductions, 0);
    const totalNet = payslips.reduce((s, p) => s + p.net_pay, 0);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)]">Payroll</h1>
                    <p className="text-xs text-[var(--text-muted)]">Employee salary processing</p>
                </div>
                <div className="flex items-center gap-2">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                    {activeTab === 'process' && <button onClick={processPayroll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"><Calculator size={14} /> Process Payroll</button>}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Total Gross</p>
                    <p className="text-xl font-black text-blue-500">{formatCurrency(totalGross)}</p>
                </div>
                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Deductions</p>
                    <p className="text-xl font-black text-red-500">{formatCurrency(totalDeductions)}</p>
                </div>
                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Net Pay</p>
                    <p className="text-xl font-black text-emerald-500">{formatCurrency(totalNet)}</p>
                </div>
            </div>

            <div className="flex gap-2">
                {(['employees', 'payslips', 'process'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${activeTab === tab ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-variant)] text-[var(--text-muted)] border border-[var(--border)]'}`}>{tab}</button>
                ))}
            </div>

            {activeTab === 'employees' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees..." className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
                        </div>
                        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs font-bold"><Plus size={14} /> Add Employee</button>
                    </div>

                    {showForm && (
                        <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                            <h3 className="text-sm font-bold">New Employee</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div><label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" /></div>
                                <div><label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Employee ID</label><input value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" /></div>
                                <div><label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Designation</label><input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" /></div>
                                <div><label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Department</label><input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" /></div>
                                <div><label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Basic Salary *</label><input type="number" value={form.basic_salary} onChange={e => setForm({ ...form, basic_salary: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" /></div>
                                <div><label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">HRA</label><input type="number" value={form.hra} onChange={e => setForm({ ...form, hra: e.target.value })} placeholder="Auto: 40% of basic" className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" /></div>
                                <div><label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">PAN</label><input value={form.pan_number} onChange={e => setForm({ ...form, pan_number: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" /></div>
                                <div><label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Bank A/c</label><input value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" /></div>
                            </div>
                            <button onClick={addEmployee} className="px-6 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold">Save Employee</button>
                        </div>
                    )}

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                        <table className="w-full text-xs">
                            <thead><tr className="bg-[var(--surface-variant)]">
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-[var(--text-muted)]">Name</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-[var(--text-muted)]">ID</th>
                                <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-[var(--text-muted)]">Designation</th>
                                <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-[var(--text-muted)]">Basic</th>
                                <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-[var(--text-muted)]">PF</th>
                                <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-[var(--text-muted)]">Net</th>
                            </tr></thead>
                            <tbody>
                                {filtered.map(emp => (
                                    <tr key={emp.id} className="border-t border-[var(--border)]/30 hover:bg-[var(--surface-variant)]/50">
                                        <td className="px-4 py-3 font-bold">{emp.name}</td>
                                        <td className="px-4 py-3 text-[var(--text-muted)]">{emp.employee_id || '-'}</td>
                                        <td className="px-4 py-3">{emp.designation || '-'}</td>
                                        <td className="px-4 py-3 text-right">{formatCurrency(emp.basic_salary)}</td>
                                        <td className="px-4 py-3 text-right text-red-500">{formatCurrency(emp.pf_deduction)}</td>
                                        <td className="px-4 py-3 text-right font-black text-emerald-500">{formatCurrency(emp.basic_salary + emp.hra + emp.allowances - emp.pf_deduction - emp.esi_deduction)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filtered.length === 0 && <div className="py-12 text-center text-[var(--text-muted)] text-xs">No employees found</div>}
                    </div>
                </div>
            )}

            {activeTab === 'payslips' && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                    <table className="w-full text-xs">
                        <thead><tr className="bg-[var(--surface-variant)]">
                            <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-[var(--text-muted)]">Employee</th>
                            <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-[var(--text-muted)]">Gross</th>
                            <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-[var(--text-muted)]">Deductions</th>
                            <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-[var(--text-muted)]">Net Pay</th>
                            <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-[var(--text-muted)]">Status</th>
                        </tr></thead>
                        <tbody>
                            {payslips.map(p => (
                                <tr key={p.id} className="border-t border-[var(--border)]/30">
                                    <td className="px-4 py-3 font-bold">{p.employee_name}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(p.gross)}</td>
                                    <td className="px-4 py-3 text-right text-red-500">{formatCurrency(p.total_deductions)}</td>
                                    <td className="px-4 py-3 text-right font-black text-emerald-500">{formatCurrency(p.net_pay)}</td>
                                    <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{p.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {payslips.length === 0 && <div className="py-12 text-center text-[var(--text-muted)] text-xs">No payslips for this month. Click "Process Payroll" to generate.</div>}
                </div>
            )}

            {activeTab === 'process' && (
                <div className="p-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-4">
                    <Calculator size={48} className="text-[var(--primary)] mx-auto" />
                    <h3 className="text-lg font-black">Process Payroll for {selectedMonth}</h3>
                    <p className="text-xs text-[var(--text-muted)]">This will generate payslips for {employees.length} employees based on their salary structure.</p>
                    <button onClick={processPayroll} className="px-8 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black">Process Now</button>
                </div>
            )}
        </div>
    );
}
