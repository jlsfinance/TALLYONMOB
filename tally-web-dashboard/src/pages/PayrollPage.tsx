import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, pendingTransactionApi } from '@/lib/insforge';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
    Briefcase, Plus, Trash2, Search, IndianRupee, Users,
    Calculator, Download, CheckCircle, Clock, FileText, X,
    Printer, Share2, Database, AlertCircle, Edit3, ShieldCheck,
    Building2, Calendar, ChevronRight, Copy, Check, ArrowRight,
    Wallet, TrendingUp, Sparkles, Filter
} from 'lucide-react';

export interface Employee {
    id: string;
    company_id: string;
    employee_id: string;
    name: string;
    designation: string;
    department: string;
    email: string;
    phone: string;
    joining_date: string;
    employment_type: 'Full-time' | 'Contract' | 'Part-time' | 'Probation';
    basic_salary: number;
    hra: number;
    da: number;
    allowances: number;
    pf_enabled: boolean;
    pf_deduction: number;
    esi_enabled: boolean;
    esi_deduction: number;
    pt_enabled: boolean;
    pt_deduction: number;
    tds_deduction: number;
    bank_name: string;
    bank_account: string;
    ifsc_code: string;
    pan_number: string;
    uan_number: string;
    is_active: boolean;
}

export interface AttendanceRecord {
    employee_id: string;
    total_days: number;
    present_days: number;
    paid_leaves: number;
    unpaid_leaves: number;
    overtime_hours: number;
}

export interface Payslip {
    id: string;
    company_id: string;
    employee_id: string;
    employee_name: string;
    employee_code: string;
    designation: string;
    department: string;
    month: string;
    working_days: number;
    payable_days: number;
    lop_days: number;
    overtime_hours: number;
    basic: number;
    hra: number;
    da: number;
    allowances: number;
    overtime_pay: number;
    gross: number;
    pf: number;
    esi: number;
    pt: number;
    tds: number;
    other_deductions: number;
    total_deductions: number;
    net_pay: number;
    employer_pf: number;
    employer_esi: number;
    status: 'draft' | 'approved' | 'paid';
    payment_mode: string;
    paid_at?: string;
    bank_account?: string;
    bank_name?: string;
    ifsc_code?: string;
    pan_number?: string;
    uan_number?: string;
}

function formatCurrency(v: number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(Math.round(v) || 0);
}

function numberToWords(num: number): string {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const roundNum = Math.floor(Math.abs(num));
    if (roundNum === 0) return 'Rupees Zero Only';

    function inWords(n: number): string {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
        if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? inWords(n % 100) : '');
        if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
        if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
        return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
    }

    return `Rupees ${inWords(roundNum).trim()} Only`;
}

const DEFAULT_STARTER_EMPLOYEES: Omit<Employee, 'id' | 'company_id'>[] = [];

const SUPABASE_DDL_SQL = `-- Run this in Supabase SQL Editor to enable full cloud synchronization for Payroll
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id TEXT,
    name TEXT NOT NULL,
    designation TEXT,
    department TEXT,
    email TEXT,
    phone TEXT,
    joining_date DATE,
    employment_type TEXT DEFAULT 'Full-time',
    basic_salary NUMERIC DEFAULT 0,
    hra NUMERIC DEFAULT 0,
    da NUMERIC DEFAULT 0,
    allowances NUMERIC DEFAULT 0,
    pf_enabled BOOLEAN DEFAULT true,
    pf_deduction NUMERIC DEFAULT 0,
    esi_enabled BOOLEAN DEFAULT false,
    esi_deduction NUMERIC DEFAULT 0,
    pt_enabled BOOLEAN DEFAULT true,
    pt_deduction NUMERIC DEFAULT 200,
    tds_deduction NUMERIC DEFAULT 0,
    bank_name TEXT,
    bank_account TEXT,
    ifsc_code TEXT,
    pan_number TEXT,
    uan_number TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    employee_name TEXT NOT NULL,
    employee_code TEXT,
    designation TEXT,
    department TEXT,
    month TEXT NOT NULL,
    working_days INT DEFAULT 30,
    payable_days NUMERIC DEFAULT 30,
    lop_days NUMERIC DEFAULT 0,
    overtime_hours NUMERIC DEFAULT 0,
    basic NUMERIC DEFAULT 0,
    hra NUMERIC DEFAULT 0,
    da NUMERIC DEFAULT 0,
    allowances NUMERIC DEFAULT 0,
    overtime_pay NUMERIC DEFAULT 0,
    gross NUMERIC DEFAULT 0,
    pf NUMERIC DEFAULT 0,
    esi NUMERIC DEFAULT 0,
    pt NUMERIC DEFAULT 0,
    tds NUMERIC DEFAULT 0,
    other_deductions NUMERIC DEFAULT 0,
    total_deductions NUMERIC DEFAULT 0,
    net_pay NUMERIC DEFAULT 0,
    employer_pf NUMERIC DEFAULT 0,
    employer_esi NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'draft',
    payment_mode TEXT DEFAULT 'Bank Transfer',
    paid_at TIMESTAMPTZ,
    bank_account TEXT,
    bank_name TEXT,
    ifsc_code TEXT,
    pan_number TEXT,
    uan_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, employee_id, month)
);

CREATE TABLE IF NOT EXISTS public.payroll_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    month TEXT NOT NULL,
    total_days INT DEFAULT 30,
    present_days NUMERIC DEFAULT 30,
    paid_leaves NUMERIC DEFAULT 0,
    unpaid_leaves NUMERIC DEFAULT 0,
    overtime_hours NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, employee_id, month)
);

-- Enable RLS and simple permissive policy for authenticated users
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to employees" ON public.employees FOR ALL USING (true);
CREATE POLICY "Allow authenticated full access to payslips" ON public.payslips FOR ALL USING (true);
CREATE POLICY "Allow authenticated full access to payroll_attendance" ON public.payroll_attendance FOR ALL USING (true);
`;

export default function PayrollPage() {
    const { selectedCompany } = useAuth() as any;
    const companyId = selectedCompany?.id || 'default_co';

    // Navigation and Filters
    const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'process' | 'payslips' | 'reports'>('employees');
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [search, setSearch] = useState('');
    const [selectedDept, setSelectedDept] = useState('All');

    // State Data
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [supabaseConnected, setSupabaseConnected] = useState<boolean | null>(null);

    // Modals
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [showSqlModal, setShowSqlModal] = useState(false);
    const [viewingPayslip, setViewingPayslip] = useState<Payslip | null>(null);
    const [copiedSql, setCopiedSql] = useState(false);

    // Employee Form State
    const [formData, setFormData] = useState({
        name: '',
        employee_id: '',
        designation: '',
        department: 'Operations',
        email: '',
        phone: '',
        joining_date: format(new Date(), 'yyyy-MM-dd'),
        employment_type: 'Full-time' as const,
        basic_salary: 25000,
        hra: 10000,
        da: 0,
        allowances: 2500,
        pf_enabled: true,
        esi_enabled: false,
        pt_enabled: true,
        tds_deduction: 0,
        bank_name: '',
        bank_account: '',
        ifsc_code: '',
        pan_number: '',
        uan_number: ''
    });

    // Storage Keys
    const EMP_KEY = `tally_payroll_emp_${companyId}`;
    const ATT_KEY = `tally_payroll_att_${companyId}_${selectedMonth}`;
    const PAY_KEY = `tally_payroll_payslips_${companyId}_${selectedMonth}`;

    // Clean mock records
    const filterOutMockEmployees = (list: any[]): Employee[] => {
        if (!Array.isArray(list)) return [];
        return list.filter((e: any) =>
            e &&
            e.name !== 'Rahul Sharma' &&
            e.name !== 'Pooja Verma' &&
            e.name !== 'Vikas Patel' &&
            !String(e.id || '').startsWith('local_emp_')
        );
    };

    // Load Data (Dual-Layer: Supabase with LocalStorage fallback)
    const loadAllData = useCallback(async () => {
        setLoading(true);
        let cloudWorks = false;

        // 1. Load Employees
        try {
            const { data, error } = await supabase
                .from('employees')
                .select('*')
                .eq('company_id', companyId)
                .order('name');

            if (!error && data) {
                cloudWorks = true;
                const realEmployees = filterOutMockEmployees(data);
                setEmployees(realEmployees);
                localStorage.setItem(EMP_KEY, JSON.stringify(realEmployees));
            } else {
                throw new Error('Supabase employees table query returned error');
            }
        } catch {
            cloudWorks = false;
            const cached = localStorage.getItem(EMP_KEY);
            if (cached) {
                try {
                    const parsed = filterOutMockEmployees(JSON.parse(cached));
                    setEmployees(parsed);
                    localStorage.setItem(EMP_KEY, JSON.stringify(parsed));
                } catch {
                    setEmployees([]);
                }
            } else {
                setEmployees([]);
            }
        }

        // 2. Load Attendance
        try {
            const { data } = await supabase
                .from('payroll_attendance')
                .select('*')
                .eq('company_id', companyId)
                .eq('month', selectedMonth);

            if (data && data.length > 0) {
                const attMap: Record<string, AttendanceRecord> = {};
                data.forEach((r: any) => { attMap[r.employee_id] = r; });
                setAttendance(attMap);
                localStorage.setItem(ATT_KEY, JSON.stringify(attMap));
            } else {
                const cachedAtt = localStorage.getItem(ATT_KEY);
                if (cachedAtt) setAttendance(JSON.parse(cachedAtt));
            }
        } catch {
            const cachedAtt = localStorage.getItem(ATT_KEY);
            if (cachedAtt) {
                try { setAttendance(JSON.parse(cachedAtt)); } catch { setAttendance({}); }
            }
        }

        // 3. Load Payslips
        try {
            const { data } = await supabase
                .from('payslips')
                .select('*')
                .eq('company_id', companyId)
                .eq('month', selectedMonth)
                .order('employee_name');

            if (data && data.length > 0) {
                setPayslips(data as Payslip[]);
                localStorage.setItem(PAY_KEY, JSON.stringify(data));
            } else {
                const cachedPays = localStorage.getItem(PAY_KEY);
                if (cachedPays) setPayslips(JSON.parse(cachedPays));
                else setPayslips([]);
            }
        } catch {
            const cachedPays = localStorage.getItem(PAY_KEY);
            if (cachedPays) {
                try { setPayslips(JSON.parse(cachedPays)); } catch { setPayslips([]); }
            } else {
                setPayslips([]);
            }
        }

        setSupabaseConnected(cloudWorks);
        setLoading(false);
    }, [companyId, selectedMonth, EMP_KEY, ATT_KEY, PAY_KEY]);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    // Departments list
    const departments = useMemo(() => {
        const depts = new Set(employees.map(e => e.department).filter(Boolean));
        return ['All', ...Array.from(depts)];
    }, [employees]);

    // Filtered Employees
    const filteredEmployees = useMemo(() => {
        return employees.filter(e => {
            const matchSearch = !search ||
                e.name.toLowerCase().includes(search.toLowerCase()) ||
                e.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
                e.designation?.toLowerCase().includes(search.toLowerCase());
            const matchDept = selectedDept === 'All' || e.department === selectedDept;
            return matchSearch && matchDept;
        });
    }, [employees, search, selectedDept]);

    // Financial KPI Summary
    const stats = useMemo(() => {
        const activeCount = employees.filter(e => e.is_active).length;
        const totalGross = payslips.reduce((s, p) => s + (p.gross || 0), 0);
        const totalNet = payslips.reduce((s, p) => s + (p.net_pay || 0), 0);
        const totalDeductions = payslips.reduce((s, p) => s + (p.total_deductions || 0), 0);
        const totalPF = payslips.reduce((s, p) => s + (p.pf || 0) + (p.employer_pf || 0), 0);
        const totalESI = payslips.reduce((s, p) => s + (p.esi || 0) + (p.employer_esi || 0), 0);
        const totalTDS = payslips.reduce((s, p) => s + (p.tds || 0), 0);
        const totalPT = payslips.reduce((s, p) => s + (p.pt || 0), 0);

        return {
            activeCount,
            totalGross,
            totalNet,
            totalDeductions,
            totalPF,
            totalESI,
            totalTDS,
            totalPT,
            totalStatutory: totalPF + totalESI + totalTDS + totalPT,
            isPaid: payslips.length > 0 && payslips.every(p => p.status === 'paid'),
            isApproved: payslips.length > 0 && payslips.every(p => p.status === 'approved' || p.status === 'paid'),
        };
    }, [employees, payslips]);

    // Open Add/Edit Employee Modal
    const handleOpenEmployeeModal = (emp?: Employee) => {
        if (emp) {
            setEditingEmployee(emp);
            setFormData({
                name: emp.name,
                employee_id: emp.employee_id,
                designation: emp.designation,
                department: emp.department,
                email: emp.email || '',
                phone: emp.phone || '',
                joining_date: emp.joining_date || format(new Date(), 'yyyy-MM-dd'),
                employment_type: emp.employment_type || 'Full-time',
                basic_salary: emp.basic_salary || 0,
                hra: emp.hra || Math.round(emp.basic_salary * 0.4),
                da: emp.da || 0,
                allowances: emp.allowances || 0,
                pf_enabled: emp.pf_enabled ?? true,
                esi_enabled: emp.esi_enabled ?? false,
                pt_enabled: emp.pt_enabled ?? true,
                tds_deduction: emp.tds_deduction || 0,
                bank_name: emp.bank_name || '',
                bank_account: emp.bank_account || '',
                ifsc_code: emp.ifsc_code || '',
                pan_number: emp.pan_number || '',
                uan_number: emp.uan_number || ''
            });
        } else {
            setEditingEmployee(null);
            const nextCode = `EMP-${String(employees.length + 1).padStart(3, '0')}`;
            setFormData({
                name: '',
                employee_id: nextCode,
                designation: '',
                department: 'Operations',
                email: '',
                phone: '',
                joining_date: format(new Date(), 'yyyy-MM-dd'),
                employment_type: 'Full-time',
                basic_salary: 25000,
                hra: 10000,
                da: 0,
                allowances: 3000,
                pf_enabled: true,
                esi_enabled: false,
                pt_enabled: true,
                tds_deduction: 0,
                bank_name: '',
                bank_account: '',
                ifsc_code: '',
                pan_number: '',
                uan_number: ''
            });
        }
        setShowEmployeeModal(true);
    };

    // Save Employee
    const handleSaveEmployee = async () => {
        if (!formData.name.trim()) {
            toast.error('Employee name is required');
            return;
        }

        const basic = Number(formData.basic_salary) || 0;
        const hra = Number(formData.hra) || Math.round(basic * 0.4);
        const da = Number(formData.da) || 0;
        const allowances = Number(formData.allowances) || 0;
        const gross = basic + hra + da + allowances;

        // Auto Statutory Deductions
        const pf_deduction = formData.pf_enabled ? Math.min(Math.round(basic * 0.12), 1800) : 0;
        const esi_deduction = (formData.esi_enabled || gross <= 21000) ? Math.round(gross * 0.0075) : 0;
        const pt_deduction = formData.pt_enabled ? 200 : 0;

        const empRecord: Employee = {
            id: editingEmployee ? editingEmployee.id : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `emp_${Date.now()}`),
            company_id: companyId,
            name: formData.name.trim(),
            employee_id: formData.employee_id.trim() || `EMP-${Date.now().toString().slice(-4)}`,
            designation: formData.designation.trim() || 'Staff',
            department: formData.department.trim() || 'General',
            email: formData.email.trim(),
            phone: formData.phone.trim(),
            joining_date: formData.joining_date,
            employment_type: formData.employment_type,
            basic_salary: basic,
            hra,
            da,
            allowances,
            pf_enabled: formData.pf_enabled,
            pf_deduction,
            esi_enabled: formData.esi_enabled,
            esi_deduction,
            pt_enabled: formData.pt_enabled,
            pt_deduction,
            tds_deduction: Number(formData.tds_deduction) || 0,
            bank_name: formData.bank_name.trim(),
            bank_account: formData.bank_account.trim(),
            ifsc_code: formData.ifsc_code.trim().toUpperCase(),
            pan_number: formData.pan_number.trim().toUpperCase(),
            uan_number: formData.uan_number.trim(),
            is_active: editingEmployee ? editingEmployee.is_active : true
        };

        // Try Supabase first
        let savedInSupabase = false;
        try {
            if (editingEmployee) {
                const { error } = await supabase.from('employees').update(empRecord).eq('id', empRecord.id);
                if (!error) savedInSupabase = true;
            } else {
                const { error } = await supabase.from('employees').insert(empRecord);
                if (!error) savedInSupabase = true;
            }
        } catch {
            savedInSupabase = false;
        }

        // Always update local storage
        let updatedList: Employee[] = [];
        if (editingEmployee) {
            updatedList = employees.map(e => e.id === empRecord.id ? empRecord : e);
        } else {
            updatedList = [empRecord, ...employees];
        }
        setEmployees(updatedList);
        localStorage.setItem(EMP_KEY, JSON.stringify(updatedList));

        if (savedInSupabase) {
            toast.success(editingEmployee ? 'Employee updated in Supabase!' : 'Employee added to Supabase!');
        } else {
            toast.success(editingEmployee ? 'Employee updated (saved locally)' : 'Employee added (saved locally)');
        }

        setShowEmployeeModal(false);
    };

    // Delete Employee
    const handleDeleteEmployee = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to remove ${name}?`)) return;

        try {
            await supabase.from('employees').delete().eq('id', id);
        } catch { }

        const updated = employees.filter(e => e.id !== id);
        setEmployees(updated);
        localStorage.setItem(EMP_KEY, JSON.stringify(updated));
        toast.success(`${name} removed.`);
    };

    // Update Attendance
    const handleAttendanceChange = (empId: string, field: keyof AttendanceRecord, value: number) => {
        const current = attendance[empId] || {
            employee_id: empId,
            total_days: 30,
            present_days: 30,
            paid_leaves: 0,
            unpaid_leaves: 0,
            overtime_hours: 0
        };

        const updated: AttendanceRecord = {
            ...current,
            [field]: Number(value) || 0
        };

        // Adjust present days if LOP changes
        if (field === 'unpaid_leaves') {
            updated.present_days = Math.max(0, updated.total_days - updated.unpaid_leaves - updated.paid_leaves);
        }

        const newMap = { ...attendance, [empId]: updated };
        setAttendance(newMap);
        localStorage.setItem(ATT_KEY, JSON.stringify(newMap));
    };

    // Mark All Present (Quick Action)
    const handleMarkAllPresent = () => {
        const newMap: Record<string, AttendanceRecord> = {};
        employees.forEach(emp => {
            newMap[emp.id] = {
                employee_id: emp.id,
                total_days: 30,
                present_days: 30,
                paid_leaves: 0,
                unpaid_leaves: 0,
                overtime_hours: 0
            };
        });
        setAttendance(newMap);
        localStorage.setItem(ATT_KEY, JSON.stringify(newMap));
        toast.success('Marked 30/30 present for all employees!');
    };

    // Batch Process Payroll for Selected Month
    const handleProcessPayroll = async () => {
        if (employees.length === 0) {
            toast.error('Add employees before processing payroll.');
            return;
        }

        const generated: Payslip[] = employees.map(emp => {
            const att = attendance[emp.id] || {
                employee_id: emp.id,
                total_days: 30,
                present_days: 30,
                paid_leaves: 0,
                unpaid_leaves: 0,
                overtime_hours: 0
            };

            const working_days = att.total_days || 30;
            const payable_days = Math.min(working_days, (att.present_days || 0) + (att.paid_leaves || 0));
            const lop_days = Math.max(0, working_days - payable_days);
            const ratio = working_days > 0 ? (payable_days / working_days) : 1;

            // Prorated earnings
            const basic = Math.round(emp.basic_salary * ratio);
            const hra = Math.round(emp.hra * ratio);
            const da = Math.round(emp.da * ratio);
            const allowances = Math.round(emp.allowances * ratio);
            const hourlyRate = (emp.basic_salary / (working_days * 8));
            const overtime_pay = Math.round((att.overtime_hours || 0) * hourlyRate * 1.5);
            const gross = basic + hra + da + allowances + overtime_pay;

            // Statutory Deductions
            const pf = emp.pf_enabled ? Math.min(Math.round(basic * 0.12), 1800) : 0;
            const esi = (emp.esi_enabled || gross <= 21000) ? Math.round(gross * 0.0075) : 0;
            const pt = emp.pt_enabled ? (gross >= 10000 ? 200 : 0) : 0;
            const tds = emp.tds_deduction || 0;
            const other_deductions = 0;
            const total_deductions = pf + esi + pt + tds + other_deductions;
            const net_pay = Math.max(0, gross - total_deductions);

            // Employer Contributions
            const employer_pf = emp.pf_enabled ? Math.min(Math.round(basic * 0.12), 1800) : 0;
            const employer_esi = (emp.esi_enabled || gross <= 21000) ? Math.round(gross * 0.0325) : 0;

            return {
                id: `payslip_${companyId}_${emp.id}_${selectedMonth}`,
                company_id: companyId,
                employee_id: emp.id,
                employee_name: emp.name,
                employee_code: emp.employee_id,
                designation: emp.designation,
                department: emp.department,
                month: selectedMonth,
                working_days,
                payable_days,
                lop_days,
                overtime_hours: att.overtime_hours || 0,
                basic,
                hra,
                da,
                allowances,
                overtime_pay,
                gross,
                pf,
                esi,
                pt,
                tds,
                other_deductions,
                total_deductions,
                net_pay,
                employer_pf,
                employer_esi,
                status: 'draft',
                payment_mode: 'Bank Transfer',
                bank_account: emp.bank_account,
                bank_name: emp.bank_name,
                ifsc_code: emp.ifsc_code,
                pan_number: emp.pan_number,
                uan_number: emp.uan_number
            };
        });

        // Try saving to Supabase
        let savedCloud = false;
        try {
            const { error } = await supabase.from('payslips').upsert(generated, { onConflict: 'company_id,employee_id,month' });
            if (!error) savedCloud = true;
        } catch {
            savedCloud = false;
        }

        setPayslips(generated);
        localStorage.setItem(PAY_KEY, JSON.stringify(generated));

        if (savedCloud) {
            toast.success(`Payroll processed for ${generated.length} employees (Synced to Supabase)!`);
        } else {
            toast.success(`Payroll computed for ${generated.length} staff! (Saved locally)`);
        }
        setActiveTab('process');
    };

    // Update Status of all Payslips
    const handleUpdateBatchStatus = async (status: 'approved' | 'paid') => {
        if (payslips.length === 0) return;
        const now = new Date().toISOString();
        const updated = payslips.map(p => ({
            ...p,
            status,
            paid_at: status === 'paid' ? now : undefined
        }));

        try {
            await supabase.from('payslips').upsert(updated, { onConflict: 'company_id,employee_id,month' });
        } catch { }

        setPayslips(updated);
        localStorage.setItem(PAY_KEY, JSON.stringify(updated));
        toast.success(`Marked all payslips as ${status.toUpperCase()}!`);
    };

    // Create Tally Accounting Journal Voucher in pending_transactions
    const handlePostSalaryToTally = async () => {
        if (payslips.length === 0) {
            toast.error('No payslips available for this month.');
            return;
        }

        const toastId = toast.loading('Posting Salary Journal to Tally Sync queue...');

        try {
            const dateStr = format(new Date(), 'yyyyMMdd');
            const salaryExpense = stats.totalGross;
            const netPayable = stats.totalNet;
            const pfLiability = stats.totalPF;
            const esiLiability = stats.totalESI;
            const tdsLiability = stats.totalTDS;
            const ptLiability = stats.totalPT;

            const voucherData = {
                voucher_type: 'Journal',
                voucher_type_name: 'Journal',
                date: dateStr,
                voucher_date: format(new Date(), 'yyyy-MM-dd'),
                narration: `Being Salary & Wages for the month of ${selectedMonth} processed for ${payslips.length} employees.`,
                total_amount: salaryExpense,
                ledger_entries: [
                    {
                        ledger_name: 'Salary & Wages',
                        amount: salaryExpense,
                        is_debit: true
                    },
                    {
                        ledger_name: 'Salaries Payable',
                        amount: -netPayable,
                        is_debit: false
                    },
                    ...(pfLiability > 0 ? [{
                        ledger_name: 'PF Payable',
                        amount: -pfLiability,
                        is_debit: false
                    }] : []),
                    ...(esiLiability > 0 ? [{
                        ledger_name: 'ESI Payable',
                        amount: -esiLiability,
                        is_debit: false
                    }] : []),
                    ...(tdsLiability > 0 ? [{
                        ledger_name: 'TDS Payable',
                        amount: -tdsLiability,
                        is_debit: false
                    }] : []),
                    ...(ptLiability > 0 ? [{
                        ledger_name: 'Professional Tax Payable',
                        amount: -ptLiability,
                        is_debit: false
                    }] : [])
                ]
            };

            const result = await pendingTransactionApi.create(companyId, 'Journal', voucherData);
            if (result.error) throw result.error;

            toast.success(`Tally Journal Voucher queued! It will sync to Tally automatically.`, { id: toastId });
        } catch (err: any) {
            toast.error(`Sync queued locally: ${err?.message || 'Ready for Tally export'}`, { id: toastId });
        }
    };

    // Export Bank Batch Payment CSV
    const handleExportBankCSV = () => {
        if (payslips.length === 0) {
            toast.error('No payslips to export.');
            return;
        }

        const headers = ['Sr No', 'Beneficiary Name', 'Account Number', 'IFSC Code', 'Amount', 'Payment Mode', 'Remarks'];
        const rows = payslips.map((p, idx) => [
            idx + 1,
            `"${p.employee_name}"`,
            `"${p.bank_account || ''}"`,
            `"${p.ifsc_code || ''}"`,
            p.net_pay,
            'NEFT',
            `"Salary for ${selectedMonth}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Salary_Payout_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Bank payout batch file downloaded!');
    };

    // Copy SQL to Clipboard
    const handleCopySql = () => {
        navigator.clipboard.writeText(SUPABASE_DDL_SQL);
        setCopiedSql(true);
        toast.success('SQL copied to clipboard!');
        setTimeout(() => setCopiedSql(false), 3000);
    };

    // Share Payslip via WhatsApp
    const handleShareWhatsApp = (p: Payslip) => {
        const emp = employees.find(e => e.id === p.employee_id);
        const phone = emp?.phone || '';
        const msg = `*SALARY SLIP - ${p.month}*\n` +
            `*Company:* ${selectedCompany?.name || 'Your Company'}\n` +
            `*Employee:* ${p.employee_name} (${p.employee_code})\n` +
            `*Designation:* ${p.designation}\n` +
            `------------------------\n` +
            `*Worked Days:* ${p.payable_days} / ${p.working_days}\n` +
            `*Gross Earnings:* ${formatCurrency(p.gross)}\n` +
            `*Total Deductions:* ${formatCurrency(p.total_deductions)}\n` +
            `*NET TAKE-HOME:* ${formatCurrency(p.net_pay)}\n` +
            `------------------------\n` +
            `Bank A/c: ${p.bank_account ? `****${p.bank_account.slice(-4)}` : 'Bank Transfer'}\n` +
            `Status: ${p.status.toUpperCase()}`;

        const url = `https://wa.me/${phone ? `91${phone.replace(/[^0-9]/g, '')}` : ''}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24 animate-fade-in text-[var(--on-surface)]">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center shadow-xs">
                            <Briefcase size={18} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight">Payroll & Salary Management</h1>
                            <p className="text-[11px] text-[var(--text-muted)]">Indian SME compliant salary computation, attendance & Tally voucher generation</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Month Picker */}
                    <div className="flex items-center gap-1.5 bg-[var(--surface-variant)] px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs">
                        <Calendar size={13} className="text-[var(--text-muted)]" />
                        <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Month:</span>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="bg-transparent font-bold text-xs focus:outline-none cursor-pointer"
                        />
                    </div>

                    {/* Supabase Status Pill */}
                    <button
                        onClick={() => setShowSqlModal(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-colors cursor-pointer ${
                            supabaseConnected
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
                        }`}
                        title="Click to view Supabase SQL setup script"
                    >
                        <Database size={12} />
                        {supabaseConnected ? 'Supabase Connected' : 'Local Storage (Tables Pending)'}
                    </button>

                    {/* Add Employee CTA */}
                    <button
                        onClick={() => handleOpenEmployeeModal()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--primary)] text-white text-xs font-bold hover:opacity-95 shadow-xs transition-opacity cursor-pointer"
                    >
                        <Plus size={14} /> Add Employee
                    </button>
                </div>
            </div>

            {/* KPI Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Total Staff</span>
                        <Users size={14} />
                    </div>
                    <p className="text-xl font-black">{stats.activeCount} <span className="text-xs font-normal text-[var(--text-muted)]">Active</span></p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{employees.length} enrolled in directory</p>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Gross Salary</span>
                        <TrendingUp size={14} className="text-blue-500" />
                    </div>
                    <p className="text-xl font-black text-blue-600">{formatCurrency(stats.totalGross)}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Earned for {selectedMonth}</p>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Statutory Deductions</span>
                        <ShieldCheck size={14} className="text-amber-500" />
                    </div>
                    <p className="text-xl font-black text-amber-600">{formatCurrency(stats.totalDeductions)}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">PF, ESI, PT & TDS Total</p>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Net Payout</span>
                        <Wallet size={14} className="text-emerald-500" />
                    </div>
                    <p className="text-xl font-black text-emerald-600">{formatCurrency(stats.totalNet)}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[8px] font-black uppercase px-1 rounded ${
                            stats.isPaid ? 'bg-emerald-100 text-emerald-800' : stats.isApproved ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                            {payslips.length === 0 ? 'Not Run' : stats.isPaid ? 'Disbursed' : stats.isApproved ? 'Approved' : 'Draft'}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">Take-home total</span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 overflow-x-auto gap-2">
                <div className="flex gap-1.5 shrink-0">
                    {[
                        { key: 'employees', label: 'Employees Directory', icon: <Users size={13} />, count: employees.length },
                        { key: 'attendance', label: 'Attendance & Days', icon: <Calendar size={13} /> },
                        { key: 'process', label: 'Payroll Run', icon: <Calculator size={13} /> },
                        { key: 'payslips', label: 'Salary Slips', icon: <FileText size={13} />, count: payslips.length },
                        { key: 'reports', label: 'Statutory & Tally Sync', icon: <Building2 size={13} /> },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as any)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                activeTab === tab.key
                                    ? 'bg-[var(--primary)] text-white shadow-xs'
                                    : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--on-surface)]'
                            }`}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                            {tab.count !== undefined && (
                                <span className={`text-[9px] px-1 py-0.2 rounded-full font-black ${
                                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-[var(--surface-variant)] text-[var(--text-muted)]'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {activeTab === 'process' && (
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleProcessPayroll}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                            <Calculator size={13} /> Recalculate {selectedMonth}
                        </button>
                    </div>
                )}
            </div>

            {/* TAB 1: EMPLOYEES DIRECTORY */}
            {activeTab === 'employees' && (
                <div className="space-y-3">
                    {/* Search & Department Filters */}
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                        <div className="relative flex-1 w-full">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by name, employee ID, or designation..."
                                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
                            <Filter size={13} className="text-[var(--text-muted)]" />
                            <span className="text-[10px] font-bold text-[var(--text-muted)]">Dept:</span>
                            <select
                                value={selectedDept}
                                onChange={e => setSelectedDept(e.target.value)}
                                className="px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-bold focus:outline-none cursor-pointer"
                            >
                                {departments.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Employees Table */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-[var(--surface-variant)] border-b border-[var(--border)] text-[var(--text-muted)]">
                                        <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Employee</th>
                                        <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Code & Dept</th>
                                        <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Basic</th>
                                        <th className="px-4 py-3 text-right font-black text-[9px] uppercase">HRA / DA / Allow</th>
                                        <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Monthly CTC</th>
                                        <th className="px-4 py-3 text-center font-black text-[9px] uppercase">Compliance</th>
                                        <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]/40">
                                    {filteredEmployees.map(emp => {
                                        const gross = (emp.basic_salary || 0) + (emp.hra || 0) + (emp.da || 0) + (emp.allowances || 0);
                                        return (
                                            <tr key={emp.id} className="hover:bg-[var(--surface-variant)]/40 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] font-black text-[10px] flex items-center justify-center shrink-0">
                                                            {emp.name.slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-xs">{emp.name}</p>
                                                            <p className="text-[10px] text-[var(--text-muted)]">{emp.designation}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                                                        {emp.employee_id}
                                                    </span>
                                                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{emp.department}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold">
                                                    {formatCurrency(emp.basic_salary)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-[11px] text-[var(--text-muted)]">
                                                    {formatCurrency((emp.hra || 0) + (emp.da || 0) + (emp.allowances || 0))}
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-emerald-600">
                                                    {formatCurrency(gross)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {emp.pf_enabled && <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-1 rounded">PF</span>}
                                                        {emp.esi_enabled && <span className="text-[8px] font-bold bg-emerald-100 text-emerald-700 px-1 rounded">ESI</span>}
                                                        {emp.pt_enabled && <span className="text-[8px] font-bold bg-purple-100 text-purple-700 px-1 rounded">PT</span>}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => handleOpenEmployeeModal(emp)}
                                                            className="p-1.5 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--text-muted)] hover:text-[var(--on-surface)] transition-colors cursor-pointer"
                                                            title="Edit Employee"
                                                        >
                                                            <Edit3 size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-500 transition-colors cursor-pointer"
                                                            title="Delete Employee"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {filteredEmployees.length === 0 && (
                            <div className="py-12 text-center text-[var(--text-muted)]">
                                <Users size={32} className="mx-auto mb-2 opacity-40" />
                                <p className="text-sm font-bold">No employees found</p>
                                <p className="text-xs mt-1">Add your staff members to get started with automated payroll.</p>
                                <button
                                    onClick={() => handleOpenEmployeeModal()}
                                    className="mt-3 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold"
                                >
                                    Add First Employee
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: ATTENDANCE & LEAVES ROSTER */}
            {activeTab === 'attendance' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs">
                        <div className="flex items-center gap-2">
                            <Clock size={16} className="text-amber-500" />
                            <div>
                                <p className="font-bold">Monthly Working Days & Attendance Sheet</p>
                                <p className="text-[10px] text-[var(--text-muted)]">Loss of Pay (LOP) reduces payable gross proportionally.</p>
                            </div>
                        </div>
                        <button
                            onClick={handleMarkAllPresent}
                            className="px-3 py-1.5 rounded-lg bg-[var(--surface-variant)] border border-[var(--border)] font-bold text-[11px] hover:bg-[var(--primary)] hover:text-white transition-all cursor-pointer"
                        >
                            Quick Mark All 30 Days Present
                        </button>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-[var(--surface-variant)] border-b border-[var(--border)] text-[var(--text-muted)]">
                                    <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Employee</th>
                                    <th className="px-3 py-3 text-center font-black text-[9px] uppercase">Total Days</th>
                                    <th className="px-3 py-3 text-center font-black text-[9px] uppercase">Present Days</th>
                                    <th className="px-3 py-3 text-center font-black text-[9px] uppercase">Paid Leaves</th>
                                    <th className="px-3 py-3 text-center font-black text-[9px] uppercase">Loss of Pay (LOP)</th>
                                    <th className="px-3 py-3 text-center font-black text-[9px] uppercase">Overtime (Hrs)</th>
                                    <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Payable Ratio</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]/40">
                                {employees.map(emp => {
                                    const att = attendance[emp.id] || {
                                        employee_id: emp.id,
                                        total_days: 30,
                                        present_days: 30,
                                        paid_leaves: 0,
                                        unpaid_leaves: 0,
                                        overtime_hours: 0
                                    };
                                    const totalDays = att.total_days || 30;
                                    const payable = Math.min(totalDays, (att.present_days || 0) + (att.paid_leaves || 0));
                                    const ratioPercent = Math.round((payable / totalDays) * 100);

                                    return (
                                        <tr key={emp.id} className="hover:bg-[var(--surface-variant)]/40">
                                            <td className="px-4 py-2.5">
                                                <p className="font-bold text-xs">{emp.name}</p>
                                                <p className="text-[10px] text-[var(--text-muted)]">{emp.employee_id} • {emp.designation}</p>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <input
                                                    type="number"
                                                    value={att.total_days}
                                                    onChange={e => handleAttendanceChange(emp.id, 'total_days', Number(e.target.value))}
                                                    className="w-14 text-center px-1.5 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-variant)] text-xs font-bold"
                                                    min="1" max="31"
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <input
                                                    type="number"
                                                    value={att.present_days}
                                                    onChange={e => handleAttendanceChange(emp.id, 'present_days', Number(e.target.value))}
                                                    className="w-14 text-center px-1.5 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-variant)] text-xs font-bold text-emerald-600"
                                                    min="0" max={att.total_days}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <input
                                                    type="number"
                                                    value={att.paid_leaves}
                                                    onChange={e => handleAttendanceChange(emp.id, 'paid_leaves', Number(e.target.value))}
                                                    className="w-14 text-center px-1.5 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-variant)] text-xs font-bold text-blue-600"
                                                    min="0" max="15"
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <input
                                                    type="number"
                                                    value={att.unpaid_leaves}
                                                    onChange={e => handleAttendanceChange(emp.id, 'unpaid_leaves', Number(e.target.value))}
                                                    className="w-14 text-center px-1.5 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-variant)] text-xs font-bold text-rose-600"
                                                    min="0" max={att.total_days}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <input
                                                    type="number"
                                                    value={att.overtime_hours}
                                                    onChange={e => handleAttendanceChange(emp.id, 'overtime_hours', Number(e.target.value))}
                                                    className="w-14 text-center px-1.5 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-variant)] text-xs font-bold"
                                                    min="0" max="100"
                                                />
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-black">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] ${
                                                    ratioPercent >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {payable} / {totalDays} ({ratioPercent}%)
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 3: PAYROLL RUN (BATCH COMPUTATION) */}
            {activeTab === 'process' && (
                <div className="space-y-4">
                    {/* Run Controls Bar */}
                    <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                        <div>
                            <h3 className="text-sm font-black">Payroll Processing for {selectedMonth}</h3>
                            <p className="text-[11px] text-[var(--text-muted)]">
                                {payslips.length === 0
                                    ? `Click "Process Payroll" to calculate prorated salaries for ${employees.length} employees.`
                                    : `Calculated for ${payslips.length} employees. Ready for approval and disbursement.`
                                }
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={handleProcessPayroll}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                            >
                                <Calculator size={13} className="inline mr-1" />
                                {payslips.length === 0 ? 'Run Payroll' : 'Recalculate Batch'}
                            </button>
                            {payslips.length > 0 && (
                                <>
                                    <button
                                        onClick={() => handleUpdateBatchStatus('approved')}
                                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                                    >
                                        <Check size={13} className="inline mr-1" /> Approve All
                                    </button>
                                    <button
                                        onClick={() => handleUpdateBatchStatus('paid')}
                                        className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                                    >
                                        <Wallet size={13} className="inline mr-1" /> Mark Paid
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Payslips Batch Table */}
                    {payslips.length > 0 && (
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-[var(--surface-variant)] border-b border-[var(--border)] text-[var(--text-muted)]">
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Staff Member</th>
                                            <th className="px-3 py-3 text-center font-black text-[9px] uppercase">Days</th>
                                            <th className="px-3 py-3 text-right font-black text-[9px] uppercase">Earned Basic</th>
                                            <th className="px-3 py-3 text-right font-black text-[9px] uppercase">Earned Gross</th>
                                            <th className="px-3 py-3 text-right font-black text-[9px] uppercase">PF (12%)</th>
                                            <th className="px-3 py-3 text-right font-black text-[9px] uppercase">ESI / PT / TDS</th>
                                            <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Net Take-Home</th>
                                            <th className="px-3 py-3 text-center font-black text-[9px] uppercase">Status</th>
                                            <th className="px-3 py-3 text-right font-black text-[9px] uppercase">Slip</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]/40">
                                        {payslips.map(p => (
                                            <tr key={p.id} className="hover:bg-[var(--surface-variant)]/40">
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-xs">{p.employee_name}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)]">{p.employee_code} • {p.designation}</p>
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className="font-mono text-[10px] font-bold">
                                                        {p.payable_days}/{p.working_days}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right font-bold">
                                                    {formatCurrency(p.basic)}
                                                </td>
                                                <td className="px-3 py-3 text-right font-black text-blue-600">
                                                    {formatCurrency(p.gross)}
                                                </td>
                                                <td className="px-3 py-3 text-right text-rose-600 font-bold">
                                                    {p.pf > 0 ? `-${formatCurrency(p.pf)}` : '-'}
                                                </td>
                                                <td className="px-3 py-3 text-right text-rose-600 font-bold">
                                                    {formatCurrency(p.esi + p.pt + p.tds)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-emerald-600 text-sm">
                                                    {formatCurrency(p.net_pay)}
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                        p.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : p.status === 'approved' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right">
                                                    <button
                                                        onClick={() => setViewingPayslip(p)}
                                                        className="px-2 py-1 rounded bg-[var(--surface-variant)] hover:bg-[var(--primary)] hover:text-white text-[10px] font-bold transition-colors cursor-pointer"
                                                    >
                                                        View Slip
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 4: SALARY SLIPS DIRECTORY */}
            {activeTab === 'payslips' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-[var(--text-muted)]">
                            Showing generated payslips for month <span className="font-bold text-[var(--on-surface)]">{selectedMonth}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleExportBankCSV}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-variant)] text-xs font-bold cursor-pointer"
                            >
                                <Download size={13} /> Export Bank Payout File
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {payslips.map(p => (
                            <div key={p.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/50 transition-colors shadow-xs">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <p className="font-black text-sm">{p.employee_name}</p>
                                        <p className="text-[10px] text-[var(--text-muted)]">{p.employee_code} • {p.designation}</p>
                                    </div>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                        p.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                        {p.status}
                                    </span>
                                </div>

                                <div className="space-y-1 py-2 border-y border-[var(--border)]/40 my-2 text-xs">
                                    <div className="flex justify-between text-[var(--text-muted)]">
                                        <span>Gross Earnings:</span>
                                        <span className="font-bold text-[var(--on-surface)]">{formatCurrency(p.gross)}</span>
                                    </div>
                                    <div className="flex justify-between text-[var(--text-muted)]">
                                        <span>Total Deductions:</span>
                                        <span className="font-bold text-rose-500">-{formatCurrency(p.total_deductions)}</span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-[var(--border)]/30">
                                        <span className="font-bold">Net Salary:</span>
                                        <span className="font-black text-emerald-600 text-sm">{formatCurrency(p.net_pay)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] text-[var(--text-muted)]">
                                        Days: {p.payable_days}/{p.working_days}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => handleShareWhatsApp(p)}
                                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                                            title="Share on WhatsApp"
                                        >
                                            <Share2 size={13} />
                                        </button>
                                        <button
                                            onClick={() => setViewingPayslip(p)}
                                            className="px-2.5 py-1 rounded-lg bg-[var(--primary)] text-white text-[10px] font-bold hover:opacity-95 cursor-pointer"
                                        >
                                            View Slip
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {payslips.length === 0 && (
                        <div className="py-16 text-center text-[var(--text-muted)] border border-[var(--border)] rounded-2xl bg-[var(--surface)]">
                            <FileText size={36} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm font-bold">No payslips generated for {selectedMonth}</p>
                            <p className="text-xs mt-1">Switch to the "Payroll Run" tab and click "Run Payroll" to generate payslips.</p>
                            <button
                                onClick={handleProcessPayroll}
                                className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                            >
                                Generate Payslips Now
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 5: STATUTORY REPORTS & TALLY SYNC */}
            {activeTab === 'reports' && (
                <div className="space-y-4">
                    {/* Tally Sync Direct Action Banner */}
                    <div className="p-4 rounded-2xl border border-[var(--border)] bg-gradient-to-r from-indigo-500/5 to-purple-500/5 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                <Building2 size={20} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black">Sync Salary Journal to Tally Prime</h3>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Debit Salary Expense ({formatCurrency(stats.totalGross)}) & Credit Salaries Payable + Statutory PF/ESI/TDS
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handlePostSalaryToTally}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap"
                        >
                            Post Journal to Tally Sync
                        </button>
                    </div>

                    {/* Statutory Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* PF Breakdown */}
                        <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black">PF ECR Liability</span>
                                <span className="text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">EPFO</span>
                            </div>
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between text-[var(--text-muted)]">
                                    <span>Employee Share (12%):</span>
                                    <span className="font-bold text-[var(--on-surface)]">{formatCurrency(payslips.reduce((s, p) => s + (p.pf || 0), 0))}</span>
                                </div>
                                <div className="flex justify-between text-[var(--text-muted)]">
                                    <span>Employer Share (12%):</span>
                                    <span className="font-bold text-[var(--on-surface)]">{formatCurrency(payslips.reduce((s, p) => s + (p.employer_pf || 0), 0))}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-[var(--border)]/40 font-black text-sm text-blue-600">
                                    <span>Total PF Remittance:</span>
                                    <span>{formatCurrency(stats.totalPF)}</span>
                                </div>
                            </div>
                        </div>

                        {/* ESI Breakdown */}
                        <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black">ESI Monthly Return</span>
                                <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">ESIC</span>
                            </div>
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between text-[var(--text-muted)]">
                                    <span>Employee Share (0.75%):</span>
                                    <span className="font-bold text-[var(--on-surface)]">{formatCurrency(payslips.reduce((s, p) => s + (p.esi || 0), 0))}</span>
                                </div>
                                <div className="flex justify-between text-[var(--text-muted)]">
                                    <span>Employer Share (3.25%):</span>
                                    <span className="font-bold text-[var(--on-surface)]">{formatCurrency(payslips.reduce((s, p) => s + (p.employer_esi || 0), 0))}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-[var(--border)]/40 font-black text-sm text-emerald-600">
                                    <span>Total ESI Challan:</span>
                                    <span>{formatCurrency(stats.totalESI)}</span>
                                </div>
                            </div>
                        </div>

                        {/* PT & TDS */}
                        <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black">Tax & Professional Tax</span>
                                <span className="text-[9px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">State & IT</span>
                            </div>
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between text-[var(--text-muted)]">
                                    <span>Professional Tax (PT):</span>
                                    <span className="font-bold text-[var(--on-surface)]">{formatCurrency(stats.totalPT)}</span>
                                </div>
                                <div className="flex justify-between text-[var(--text-muted)]">
                                    <span>TDS Withheld (Sec 192):</span>
                                    <span className="font-bold text-[var(--on-surface)]">{formatCurrency(stats.totalTDS)}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-[var(--border)]/40 font-black text-sm text-purple-600">
                                    <span>Total Tax Liability:</span>
                                    <span>{formatCurrency(stats.totalPT + stats.totalTDS)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 1: ADD / EDIT EMPLOYEE */}
            {showEmployeeModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center">
                                    <Users size={16} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black">{editingEmployee ? 'Edit Employee Details' : 'Add New Staff Member'}</h3>
                                    <p className="text-[10px] text-[var(--text-muted)]">Configure employee profile, salary breakdown, and compliance rules</p>
                                </div>
                            </div>
                            <button onClick={() => setShowEmployeeModal(false)} className="p-1 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--text-muted)]">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-4 text-xs">
                            {/* Section: Profile */}
                            <div>
                                <h4 className="text-[10px] font-black uppercase text-[var(--primary)] tracking-wider mb-2">1. Personal & Employment Profile</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Full Name *</label>
                                        <input
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g. Ramesh Kumar"
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Employee Code</label>
                                        <input
                                            value={formData.employee_id}
                                            onChange={e => setFormData({ ...formData, employee_id: e.target.value })}
                                            placeholder="e.g. EMP-001"
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-mono font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Designation</label>
                                        <input
                                            value={formData.designation}
                                            onChange={e => setFormData({ ...formData, designation: e.target.value })}
                                            placeholder="e.g. Sales Officer"
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Department</label>
                                        <input
                                            value={formData.department}
                                            onChange={e => setFormData({ ...formData, department: e.target.value })}
                                            placeholder="e.g. Accounts / Sales"
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Mobile / WhatsApp</label>
                                        <input
                                            value={formData.phone}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                            placeholder="9876543210"
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Employment Type</label>
                                        <select
                                            value={formData.employment_type}
                                            onChange={e => setFormData({ ...formData, employment_type: e.target.value as any })}
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold cursor-pointer"
                                        >
                                            <option value="Full-time">Full-time</option>
                                            <option value="Contract">Contract</option>
                                            <option value="Part-time">Part-time</option>
                                            <option value="Probation">Probation</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Salary Structure */}
                            <div className="pt-2 border-t border-[var(--border)]">
                                <h4 className="text-[10px] font-black uppercase text-[var(--primary)] tracking-wider mb-2">2. Monthly Compensation Structure</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Basic Pay (₹) *</label>
                                        <input
                                            type="number"
                                            value={formData.basic_salary}
                                            onChange={e => {
                                                const basic = Number(e.target.value) || 0;
                                                setFormData({
                                                    ...formData,
                                                    basic_salary: basic,
                                                    hra: Math.round(basic * 0.4)
                                                });
                                            }}
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">HRA (₹)</label>
                                        <input
                                            type="number"
                                            value={formData.hra}
                                            onChange={e => setFormData({ ...formData, hra: Number(e.target.value) || 0 })}
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">DA (₹)</label>
                                        <input
                                            type="number"
                                            value={formData.da}
                                            onChange={e => setFormData({ ...formData, da: Number(e.target.value) || 0 })}
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Special Allowances (₹)</label>
                                        <input
                                            type="number"
                                            value={formData.allowances}
                                            onChange={e => setFormData({ ...formData, allowances: Number(e.target.value) || 0 })}
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="mt-2 p-2 rounded-lg bg-[var(--surface-variant)] text-[11px] font-bold flex justify-between">
                                    <span>Calculated Monthly Gross CTC:</span>
                                    <span className="text-emerald-600 font-black">
                                        {formatCurrency((formData.basic_salary || 0) + (formData.hra || 0) + (formData.da || 0) + (formData.allowances || 0))}
                                    </span>
                                </div>
                            </div>

                            {/* Section: Statutory & Compliance */}
                            <div className="pt-2 border-t border-[var(--border)]">
                                <h4 className="text-[10px] font-black uppercase text-[var(--primary)] tracking-wider mb-2">3. Statutory Rules (PF, ESI, PT)</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.pf_enabled}
                                            onChange={e => setFormData({ ...formData, pf_enabled: e.target.checked })}
                                            className="w-4 h-4 rounded text-[var(--primary)]"
                                        />
                                        <div>
                                            <p className="font-bold text-[11px]">Deduct PF (12%)</p>
                                            <p className="text-[9px] text-[var(--text-muted)]">Capped at ₹1,800/mo</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.esi_enabled}
                                            onChange={e => setFormData({ ...formData, esi_enabled: e.target.checked })}
                                            className="w-4 h-4 rounded text-[var(--primary)]"
                                        />
                                        <div>
                                            <p className="font-bold text-[11px]">Deduct ESI (0.75%)</p>
                                            <p className="text-[9px] text-[var(--text-muted)]">If Gross ≤ ₹21,000</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.pt_enabled}
                                            onChange={e => setFormData({ ...formData, pt_enabled: e.target.checked })}
                                            className="w-4 h-4 rounded text-[var(--primary)]"
                                        />
                                        <div>
                                            <p className="font-bold text-[11px]">Professional Tax</p>
                                            <p className="text-[9px] text-[var(--text-muted)]">Standard ₹200 slab</p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Section: Banking & Tax */}
                            <div className="pt-2 border-t border-[var(--border)]">
                                <h4 className="text-[10px] font-black uppercase text-[var(--primary)] tracking-wider mb-2">4. Bank & Tax Identification</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Bank Name</label>
                                        <input
                                            value={formData.bank_name}
                                            onChange={e => setFormData({ ...formData, bank_name: e.target.value })}
                                            placeholder="HDFC / SBI / ICICI"
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">Bank A/c No</label>
                                        <input
                                            value={formData.bank_account}
                                            onChange={e => setFormData({ ...formData, bank_account: e.target.value })}
                                            placeholder="50100..."
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">IFSC Code</label>
                                        <input
                                            value={formData.ifsc_code}
                                            onChange={e => setFormData({ ...formData, ifsc_code: e.target.value })}
                                            placeholder="HDFC0001234"
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-mono uppercase"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-muted)]">PAN Number</label>
                                        <input
                                            value={formData.pan_number}
                                            onChange={e => setFormData({ ...formData, pan_number: e.target.value })}
                                            placeholder="ABCPS1234F"
                                            className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-mono uppercase"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-[var(--border)] flex items-center justify-end gap-2 bg-[var(--surface-variant)]/40">
                            <button
                                onClick={() => setShowEmployeeModal(false)}
                                className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold hover:bg-[var(--surface-variant)]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEmployee}
                                className="px-5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold hover:opacity-95 shadow-xs"
                            >
                                {editingEmployee ? 'Update Employee' : 'Save Employee'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 2: INTERACTIVE PRINTABLE SALARY SLIP */}
            {viewingPayslip && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                        {/* Modal Header Controls */}
                        <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between no-print">
                            <span className="text-xs font-bold text-gray-600">Payslip Preview • {viewingPayslip.month}</span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => handleShareWhatsApp(viewingPayslip)}
                                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                                >
                                    <Share2 size={13} /> WhatsApp
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                                >
                                    <Printer size={13} /> Print Slip
                                </button>
                                <button onClick={() => setViewingPayslip(null)} className="p-1 rounded-lg hover:bg-gray-200 text-gray-500">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Printable Payslip Body */}
                        <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
                            {/* Company Branding */}
                            <div className="text-center pb-3 border-b-2 border-gray-800">
                                <h2 className="text-lg font-black uppercase tracking-wide">{selectedCompany?.name || 'BUSINESS ENTERPRISE'}</h2>
                                <p className="text-[10px] text-gray-500">PAYSLIP FOR THE MONTH OF {format(new Date(viewingPayslip.month + '-01'), 'MMMM yyyy').toUpperCase()}</p>
                            </div>

                            {/* Employee Info Grid */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 p-3 rounded-lg bg-gray-50 border border-gray-200 text-[11px]">
                                <div><span className="font-bold text-gray-500">Employee Name:</span> <span className="font-black text-gray-900">{viewingPayslip.employee_name}</span></div>
                                <div><span className="font-bold text-gray-500">Employee ID:</span> <span className="font-mono font-bold text-gray-900">{viewingPayslip.employee_code}</span></div>
                                <div><span className="font-bold text-gray-500">Designation:</span> <span className="font-medium text-gray-900">{viewingPayslip.designation}</span></div>
                                <div><span className="font-bold text-gray-500">Department:</span> <span className="font-medium text-gray-900">{viewingPayslip.department}</span></div>
                                <div><span className="font-bold text-gray-500">Bank Account:</span> <span className="font-mono text-gray-900">{viewingPayslip.bank_account || 'N/A'}</span></div>
                                <div><span className="font-bold text-gray-500">IFSC Code:</span> <span className="font-mono text-gray-900">{viewingPayslip.ifsc_code || 'N/A'}</span></div>
                                <div><span className="font-bold text-gray-500">PAN Number:</span> <span className="font-mono text-gray-900">{viewingPayslip.pan_number || 'N/A'}</span></div>
                                <div><span className="font-bold text-gray-500">Payable Days:</span> <span className="font-bold text-gray-900">{viewingPayslip.payable_days} of {viewingPayslip.working_days} Days</span></div>
                            </div>

                            {/* Dual Table: Earnings vs Deductions */}
                            <div className="grid grid-cols-2 border border-gray-300 rounded-lg overflow-hidden">
                                {/* Earnings Column */}
                                <div className="border-r border-gray-300">
                                    <div className="bg-gray-100 p-2 font-black text-[10px] uppercase text-gray-700 border-b border-gray-300">Earnings</div>
                                    <div className="p-2 space-y-1">
                                        <div className="flex justify-between"><span>Basic Salary:</span><span className="font-bold">{formatCurrency(viewingPayslip.basic)}</span></div>
                                        <div className="flex justify-between"><span>HRA:</span><span className="font-bold">{formatCurrency(viewingPayslip.hra)}</span></div>
                                        {viewingPayslip.da > 0 && <div className="flex justify-between"><span>Dearness Allowance:</span><span className="font-bold">{formatCurrency(viewingPayslip.da)}</span></div>}
                                        {viewingPayslip.allowances > 0 && <div className="flex justify-between"><span>Special Allowances:</span><span className="font-bold">{formatCurrency(viewingPayslip.allowances)}</span></div>}
                                        {viewingPayslip.overtime_pay > 0 && <div className="flex justify-between"><span>Overtime Pay:</span><span className="font-bold">{formatCurrency(viewingPayslip.overtime_pay)}</span></div>}
                                    </div>
                                    <div className="bg-gray-50 p-2 border-t border-gray-300 flex justify-between font-black">
                                        <span>Total Earnings (A):</span>
                                        <span className="text-blue-700">{formatCurrency(viewingPayslip.gross)}</span>
                                    </div>
                                </div>

                                {/* Deductions Column */}
                                <div>
                                    <div className="bg-gray-100 p-2 font-black text-[10px] uppercase text-gray-700 border-b border-gray-300">Deductions</div>
                                    <div className="p-2 space-y-1">
                                        <div className="flex justify-between"><span>Provident Fund (PF):</span><span className="font-bold">{viewingPayslip.pf > 0 ? formatCurrency(viewingPayslip.pf) : '₹0'}</span></div>
                                        <div className="flex justify-between"><span>ESI Deduction:</span><span className="font-bold">{viewingPayslip.esi > 0 ? formatCurrency(viewingPayslip.esi) : '₹0'}</span></div>
                                        <div className="flex justify-between"><span>Professional Tax (PT):</span><span className="font-bold">{viewingPayslip.pt > 0 ? formatCurrency(viewingPayslip.pt) : '₹0'}</span></div>
                                        {viewingPayslip.tds > 0 && <div className="flex justify-between"><span>Income Tax (TDS):</span><span className="font-bold">{formatCurrency(viewingPayslip.tds)}</span></div>}
                                        {viewingPayslip.other_deductions > 0 && <div className="flex justify-between"><span>Other Deductions:</span><span className="font-bold">{formatCurrency(viewingPayslip.other_deductions)}</span></div>}
                                    </div>
                                    <div className="bg-gray-50 p-2 border-t border-gray-300 flex justify-between font-black">
                                        <span>Total Deductions (B):</span>
                                        <span className="text-rose-700">{formatCurrency(viewingPayslip.total_deductions)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Net Take-Home Highlight */}
                            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase text-emerald-800">Net Take-Home Salary (A - B)</p>
                                    <p className="text-xs font-bold text-gray-700 mt-0.5">{numberToWords(viewingPayslip.net_pay)}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xl font-black text-emerald-800">{formatCurrency(viewingPayslip.net_pay)}</span>
                                </div>
                            </div>

                            {/* Signatures */}
                            <div className="pt-8 flex justify-between text-[10px] text-gray-500">
                                <div>
                                    <p className="border-t border-gray-400 pt-1 w-36 text-center">Employee Signature</p>
                                </div>
                                <div>
                                    <p className="border-t border-gray-400 pt-1 w-36 text-center">Authorized Signatory</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 3: SUPABASE SQL DDL SETUP SCRIPT */}
            {showSqlModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Database size={16} className="text-indigo-500" />
                                <div>
                                    <h3 className="text-sm font-black">Supabase Payroll Tables Setup</h3>
                                    <p className="text-[10px] text-[var(--text-muted)]">Run this SQL script in Supabase Dashboard SQL Editor to enable full cloud synchronization</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSqlModal(false)} className="p-1 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--text-muted)]">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto space-y-3 text-xs">
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs flex items-start gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold">Why is this here?</p>
                                    <p className="text-[11px] mt-0.5">
                                        Your app works 100% right now using persistent Local Storage. To synchronize across multiple devices and store payroll records permanently on Supabase, run the SQL script below once in your Supabase SQL editor.
                                    </p>
                                </div>
                            </div>

                            <div className="relative">
                                <pre className="p-3 rounded-xl bg-black/90 text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-72 border border-[var(--border)]">
                                    {SUPABASE_DDL_SQL}
                                </pre>
                                <button
                                    onClick={handleCopySql}
                                    className="absolute top-2 right-2 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold shadow-xs cursor-pointer hover:opacity-90"
                                >
                                    {copiedSql ? <Check size={12} /> : <Copy size={12} />}
                                    {copiedSql ? 'Copied!' : 'Copy SQL'}
                                </button>
                            </div>
                        </div>

                        <div className="p-3 border-t border-[var(--border)] flex justify-end bg-[var(--surface-variant)]/40">
                            <button
                                onClick={() => setShowSqlModal(false)}
                                className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
