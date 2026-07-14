import { useState, useMemo, useCallback, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  Calculator,
  CalendarDays,
  Plus,
  Trash2,
  Edit3,
  Download,
  Search,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Users,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  X,
  Save,
  Filter,
  RefreshCw,
  Eye,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, differenceInDays, parseISO } from "date-fns";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/insforge";

// ─── Types ───────────────────────────────────────────────────────────────────

type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
type TabType = "dashboard" | "form26q" | "form27q" | "tcs" | "calculator" | "calendar";

interface VoucherRow {
  id: string;
  company_id: string;
  voucher_type: string;
  voucher_number: string;
  voucher_date: string;
  party_name: string;
  grand_total: number;
  total_amount: number;
  is_deleted: boolean;
}

interface DeducteeEntry {
  id: string;
  name: string;
  pan: string;
  section: string;
  paymentDate: string;
  baseAmount: number;
  tdsRate: number;
  tdsAmount: number;
  status: "pending" | "filed" | "overdue";
}

interface NonResidentEntry extends DeducteeEntry {
  nationality: string;
  taxTreatyCountry: string;
  articleNumber: string;
}

interface TCSEntry {
  id: string;
  collecteeName: string;
  pan: string;
  section: string;
  paymentDate: string;
  baseAmount: number;
  tcsRate: number;
  tcsAmount: number;
  status: "pending" | "filed" | "overdue";
  certificateGenerated: boolean;
}

interface ComplianceItem {
  id: string;
  type: "tds_payment" | "tds_return" | "tcs_return";
  description: string;
  dueDate: string;
  status: "upcoming" | "overdue" | "completed";
}

interface CalculatorInputs {
  section: string;
  baseAmount: number;
  panAvailable: boolean;
  isResident: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TDS_SECTIONS: Record<string, { label: string; residentRate: number; nonResidentRate: number }> = {
  "194C": { label: "Payment to Contractor", residentRate: 1, nonResidentRate: 2 },
  "194H": { label: "Commission/Brokerage", residentRate: 5, nonResidentRate: 5 },
  "194I_land": { label: "Rent - Land/Building", residentRate: 10, nonResidentRate: 10 },
  "194I_equipment": { label: "Rent - Plant/Machinery", residentRate: 2, nonResidentRate: 2 },
  "194J_technical": { label: "Professional/Technical Fees", residentRate: 2, nonResidentRate: 10 },
  "194J_other": { label: "Royalty (Section 194J)", residentRate: 10, nonResidentRate: 10 },
  "194A": { label: "Interest other than Securities", residentRate: 10, nonResidentRate: 10 },
  "194B": { label: "Winnings from Lottery", residentRate: 30, nonResidentRate: 30 },
  "194D": { label: "Insurance Commission", residentRate: 5, nonResidentRate: 5 },
  "194E": { label: "Payment to Non-Resident Sportsman", residentRate: 20, nonResidentRate: 20 },
  "195": { label: "Payment to Non-Resident", residentRate: 0, nonResidentRate: 20 },
  "196A": { label: "Income from Units to NRI", residentRate: 0, nonResidentRate: 20 },
  "196B": { label: "Income from Units (Offshore Fund)", residentRate: 0, nonResidentRate: 10 },
  "196C": { label: "Income from Foreign Currency Bonds", residentRate: 0, nonResidentRate: 10 },
  "196D": { label: "Income of FIIs from Securities", residentRate: 0, nonResidentRate: 20 },
};

const TCS_SECTIONS: Record<string, { label: string; rate: number }> = {
  "206C_1": { label: "Alcoholic Liquor", rate: 1 },
  "206C_1C": { label: "Tendu Leaves", rate: 5 },
  "206C_1D": { label: "Timber obtained under Forest Lease", rate: 2.5 },
  "206C_1H": { label: "Sale of Motor Vehicle (>₹10L)", rate: 1 },
  "206C_1I": { label: "Sale of Goods (>₹50L)", rate: 0.1 },
  "206C_1J": { label: "Sale of Mineral ores", rate: 1 },
};

const SURCHARGE_RATES = [
  { limit: 5000000, rate: 0 },
  { limit: 10000000, rate: 10 },
  { limit: 20000000, rate: 15 },
  { limit: Infinity, rate: 25 },
];

const QUARTERS: { value: Quarter; label: string; months: string }[] = [
  { value: "Q1", label: "Q1 (Apr-Jun)", months: "Apr, May, Jun" },
  { value: "Q2", label: "Q2 (Jul-Sep)", months: "Jul, Aug, Sep" },
  { value: "Q3", label: "Q3 (Oct-Dec)", months: "Oct, Nov, Dec" },
  { value: "Q4", label: "Q4 (Jan-Mar)", months: "Jan, Feb, Mar" },
];

const FINANCIAL_YEARS = ["2024-25", "2025-26", "2026-27"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function isValidPAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

function calculateTDS(baseAmount: number, rate: number): number {
  return Math.round((baseAmount * rate) / 100);
}

function calculateSurcharge(income: number): number {
  for (const slab of SURCHARGE_RATES) {
    if (income <= slab.limit) return slab.rate;
  }
  return 25;
}

function calculateCess(amount: number): number {
  return Math.round(amount * 4 / 100);
}

function getFYDateRange(year: string): { from: string; to: string } {
  const fyStart = parseInt(year.split("-")[0]);
  return {
    from: `${fyStart}-04-01`,
    to: `${fyStart + 1}-03-31`,
  };
}

function getQuarterDateRange(year: string, quarter: Quarter): { from: string; to: string } {
  const fyStart = parseInt(year.split("-")[0]);
  const ranges: Record<Quarter, { from: string; to: string }> = {
    Q1: { from: `${fyStart}-04-01`, to: `${fyStart}-06-30` },
    Q2: { from: `${fyStart}-07-01`, to: `${fyStart}-09-30` },
    Q3: { from: `${fyStart}-10-01`, to: `${fyStart + 1}-12-31` },
    Q4: { from: `${fyStart + 1}-01-01`, to: `${fyStart + 1}-03-31` },
  };
  return ranges[quarter];
}

function getComplianceDueDates(year: string): ComplianceItem[] {
  const fyStart = parseInt(year.split("-")[0]);
  return [
    { id: "c1", type: "tds_payment", description: "TDS Payment - April", dueDate: `${fyStart}-05-07`, status: "upcoming" },
    { id: "c2", type: "tds_payment", description: "TDS Payment - May", dueDate: `${fyStart}-06-07`, status: "upcoming" },
    { id: "c3", type: "tds_payment", description: "TDS Payment - June", dueDate: `${fyStart}-07-07`, status: "upcoming" },
    { id: "c4", type: "tds_return", description: "Form 26Q/27Q - Q1 Return", dueDate: `${fyStart}-07-31`, status: "upcoming" },
    { id: "c5", type: "tds_payment", description: "TDS Payment - July", dueDate: `${fyStart}-08-07`, status: "upcoming" },
    { id: "c6", type: "tds_payment", description: "TDS Payment - August", dueDate: `${fyStart}-09-07`, status: "upcoming" },
    { id: "c7", type: "tds_payment", description: "TDS Payment - September", dueDate: `${fyStart}-10-07`, status: "upcoming" },
    { id: "c8", type: "tds_return", description: "Form 26Q/27Q - Q2 Return", dueDate: `${fyStart}-10-31`, status: "upcoming" },
    { id: "c9", type: "tds_payment", description: "TDS Payment - October", dueDate: `${fyStart}-11-07`, status: "upcoming" },
    { id: "c10", type: "tds_payment", description: "TDS Payment - November", dueDate: `${fyStart}-12-07`, status: "upcoming" },
    { id: "c11", type: "tds_payment", description: "TDS Payment - December", dueDate: `${fyStart + 1}-01-07`, status: "upcoming" },
    { id: "c12", type: "tds_return", description: "Form 26Q/27Q - Q3 Return", dueDate: `${fyStart + 1}-01-31`, status: "upcoming" },
    { id: "c13", type: "tds_payment", description: "TDS Payment - January", dueDate: `${fyStart + 1}-02-07`, status: "upcoming" },
    { id: "c14", type: "tds_payment", description: "TDS Payment - February", dueDate: `${fyStart + 1}-03-07`, status: "upcoming" },
    { id: "c15", type: "tds_payment", description: "TDS Payment - March", dueDate: `${fyStart + 1}-04-07`, status: "upcoming" },
    { id: "c16", type: "tds_return", description: "Form 26Q/27Q - Q4 Return", dueDate: `${fyStart + 1}-05-31`, status: "upcoming" },
    { id: "c17", type: "tcs_return", description: "TCS Return - Q1", dueDate: `${fyStart}-07-15`, status: "upcoming" },
    { id: "c18", type: "tcs_return", description: "TCS Return - Q2", dueDate: `${fyStart}-10-15`, status: "upcoming" },
    { id: "c19", type: "tcs_return", description: "TCS Return - Q3", dueDate: `${fyStart + 1}-01-15`, status: "upcoming" },
    { id: "c20", type: "tcs_return", description: "TCS Return - Q4", dueDate: `${fyStart + 1}-04-15`, status: "upcoming" },
  ];
}

function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) {
    toast.error("No data to export");
    return;
  }
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const escaped = String(val ?? "").replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${format(new Date(), "yyyyMMdd")}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast.success(`Exported ${filename}`);
}

// ─── TDS/TCS Computation from Vouchers ───────────────────────────────────────

interface AggregatedParty {
  name: string;
  totalPayments: number;
  voucherCount: number;
  latestDate: string;
}

function aggregatePaymentParties(vouchers: VoucherRow[]): Map<string, AggregatedParty> {
  const map = new Map<string, AggregatedParty>();
  for (const v of vouchers) {
    const name = v.party_name || "Unknown";
    const amount = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
    const existing = map.get(name);
    if (existing) {
      existing.totalPayments += amount;
      existing.voucherCount += 1;
      if (v.voucher_date > existing.latestDate) existing.latestDate = v.voucher_date;
    } else {
      map.set(name, { name, totalPayments: amount, voucherCount: 1, latestDate: v.voucher_date });
    }
  }
  return map;
}

function computeTDSFromVouchers(
  paymentVouchers: VoucherRow[],
  existingFiledEntries: DeducteeEntry[]
): DeducteeEntry[] {
  const partyMap = aggregatePaymentParties(paymentVouchers);
  const filedNames = new Set(existingFiledEntries.map((e) => e.name));
  const results: DeducteeEntry[] = [];

  // Section 194C: Contractors — 1% on single payment > ₹30,000 or aggregate > ₹1,00,000
  // Section 194J: Professional Fees — 2% (technical) / 10% (other) on payments > ₹30,000
  // Section 194I: Rent — 10% on rent > ₹2,40,000/year
  // We use party name heuristics from Tally (common ledger grouping names)

  for (const [name, agg] of partyMap) {
    if (filedNames.has(name)) continue;

    let section = "194C";
    let rate = TDS_SECTIONS["194C"].residentRate;
    let threshold = 30000;

    const lowerName = name.toLowerCase();
    if (lowerName.includes("rent") || lowerName.includes("lease") || lowerName.includes("property")) {
      section = "194I_land";
      rate = TDS_SECTIONS["194I_land"].residentRate;
      threshold = 240000;
    } else if (
      lowerName.includes("professional") ||
      lowerName.includes("consultant") ||
      lowerName.includes("advisor") ||
      lowerName.includes("legal") ||
      lowerName.includes("ca ") ||
      lowerName.includes("audit")
    ) {
      section = "194J_technical";
      rate = TDS_SECTIONS["194J_technical"].residentRate;
      threshold = 30000;
    } else if (
      lowerName.includes("technical") ||
      lowerName.includes("software") ||
      lowerName.includes("it service") ||
      lowerName.includes("development")
    ) {
      section = "194J_technical";
      rate = TDS_SECTIONS["194J_technical"].residentRate;
      threshold = 30000;
    } else if (lowerName.includes("commission") || lowerName.includes("broker")) {
      section = "194H";
      rate = TDS_SECTIONS["194H"].residentRate;
      threshold = 0;
    }

    // Apply threshold logic
    const applicable = section === "194C"
      ? (agg.totalPayments > 30000 || agg.totalPayments > 100000)
      : agg.totalPayments > threshold;

    if (!applicable) continue;

    const tdsAmount = calculateTDS(agg.totalPayments, rate);
    results.push({
      id: `pending_${name.replace(/\s/g, "_")}_${section}`,
      name,
      pan: "PANPENDING",
      section,
      paymentDate: agg.latestDate,
      baseAmount: agg.totalPayments,
      tdsRate: rate,
      tdsAmount,
      status: "pending",
    });
  }

  return results;
}

function computeTCSFromVouchers(
  salesVouchers: VoucherRow[],
  existingFiledEntries: TCSEntry[]
): TCSEntry[] {
  const partyMap = aggregatePaymentParties(salesVouchers);
  const filedNames = new Set(existingFiledEntries.map((e) => e.collecteeName));
  const results: TCSEntry[] = [];

  for (const [name, agg] of partyMap) {
    if (filedNames.has(name)) continue;

    // Section 206C(1H): Sale of goods > ₹50,00,000 — 0.075% TCS
    // Section 206C: Scrap sales > ₹5,00,000 — 1% TCS
    const lowerName = name.toLowerCase();
    let section = "206C_1I";
    let rate = 0.075;

    if (lowerName.includes("scrap") || lowerName.includes("waste")) {
      section = "206C_1J";
      rate = 1;
      if (agg.totalPayments <= 500000) continue;
    } else {
      // General goods > ₹50L
      if (agg.totalPayments <= 5000000) continue;
    }

    const tcsAmount = calculateTDS(agg.totalPayments, rate);
    results.push({
      id: `pending_tcs_${name.replace(/\s/g, "_")}_${section}`,
      collecteeName: name,
      pan: "PANPENDING",
      section,
      paymentDate: agg.latestDate,
      baseAmount: agg.totalPayments,
      tcsRate: rate,
      tcsAmount,
      status: "pending",
      certificateGenerated: false,
    });
  }

  return results;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  trend,
  color,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend?: { value: string; positive: boolean };
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 md:p-5 hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={16} className="md:hidden" />
          <Icon size={20} className="hidden md:block" />
        </div>
        {trend && (
          <span className={`text-[10px] md:text-xs font-medium flex items-center gap-1 ${trend.positive ? "text-emerald-400" : "text-red-400"}`}>
            {trend.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-lg md:text-2xl font-bold text-white mb-0.5 md:mb-1">{value}</p>
      <p className="text-[11px] md:text-sm text-zinc-400">{label}</p>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    filed: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: CheckCircle2 },
    pending: { bg: "bg-amber-500/10", text: "text-amber-400", icon: Clock },
    overdue: { bg: "bg-red-500/10", text: "text-red-400", icon: AlertTriangle },
    upcoming: { bg: "bg-sky-500/10", text: "text-sky-400", icon: Clock },
    completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: CheckCircle2 },
  };
  const cfg = config[status] || config.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <Icon size={12} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TDSTCSPage() {
  const { selectedCompany } = useAuth() as any;

  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>("Q1");
  const [selectedFY, setSelectedFY] = useState("2025-26");

  // Data state
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [deductees, setDeductees] = useState<DeducteeEntry[]>([]);
  const [nonResidents, setNonResidents] = useState<NonResidentEntry[]>([]);
  const [tcsEntries, setTCSEntries] = useState<TCSEntry[]>([]);
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>(() => getComplianceDueDates("2025-26"));

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [editingDeductee, setEditingDeductee] = useState<DeducteeEntry | null>(null);
  const [editingNonResident, setEditingNonResident] = useState<NonResidentEntry | null>(null);
  const [editingTCS, setEditingTCS] = useState<TCSEntry | null>(null);
  const [showDeducteeForm, setShowDeducteeForm] = useState(false);
  const [showNonResidentForm, setShowNonResidentForm] = useState(false);
  const [showTCSForm, setShowTCSForm] = useState(false);

  // Calculator state
  const [calcInputs, setCalcInputs] = useState<CalculatorInputs>({
    section: "194C",
    baseAmount: 100000,
    panAvailable: true,
    isResident: true,
  });

  // Search/filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!selectedCompany?.id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { from, to } = getFYDateRange(selectedFY);

      const [voucherRes, tdsTcsRes] = await Promise.all([
        supabase
          .from("vouchers")
          .select("id, company_id, voucher_type, voucher_number, voucher_date, party_name, grand_total, total_amount, is_deleted")
          .eq("company_id", selectedCompany.id)
          .eq("is_deleted", false)
          .gte("voucher_date", from)
          .lte("voucher_date", to),
        supabase
          .from("tds_tcs_entries")
          .select("*")
          .eq("company_id", selectedCompany.id)
          .order("created_at", { ascending: false }),
      ]);

      if (voucherRes.error) throw voucherRes.error;
      // tds_tcs_entries table might not exist yet — handle gracefully
      if (tdsTcsRes.error) {
        const errMsg = String(tdsTcsRes.error.message || '');
        const isMissingTable = tdsTcsRes.error.code === '42P01' || errMsg.includes('does not exist') || errMsg.includes('PGRST205');
        if (!isMissingTable) throw tdsTcsRes.error;
        console.warn('tds_tcs_entries table not found — running without filed entries');
      }

      const allVouchers: VoucherRow[] = voucherRes.data || [];
      setVouchers(allVouchers);

      // Separate filed entries from tds_tcs_entries table
      const filedTDSEntries: DeducteeEntry[] = [];
      const filedNonResidentEntries: NonResidentEntry[] = [];
      const filedTCSEntries: TCSEntry[] = [];

      for (const row of tdsTcsRes.data || []) {
        if (row.entry_type === "tcs") {
          filedTCSEntries.push({
            id: row.id,
            collecteeName: row.party_name || row.name || "",
            pan: row.pan || "PANPENDING",
            section: row.section || "206C_1H",
            paymentDate: row.entry_date || row.payment_date || row.created_at,
            baseAmount: Number(row.base_amount) || 0,
            tcsRate: Number(row.tax_rate) || 0,
            tcsAmount: Number(row.tax_amount) || 0,
            status: row.status || "filed",
            certificateGenerated: row.certificate_generated || false,
          });
        } else if (row.is_non_resident) {
          filedNonResidentEntries.push({
            id: row.id,
            name: row.party_name || row.name || "",
            pan: row.pan || "PANPENDING",
            section: row.section || "195",
            paymentDate: row.entry_date || row.payment_date || row.created_at,
            baseAmount: Number(row.base_amount) || 0,
            tdsRate: Number(row.tax_rate) || 0,
            tdsAmount: Number(row.tax_amount) || 0,
            status: row.status || "filed",
            nationality: row.nationality || "",
            taxTreatyCountry: row.tax_treaty_country || "",
            articleNumber: row.article_number || "",
          });
        } else {
          filedTDSEntries.push({
            id: row.id,
            name: row.party_name || row.name || "",
            pan: row.pan || "PANPENDING",
            section: row.section || "194C",
            paymentDate: row.entry_date || row.payment_date || row.created_at,
            baseAmount: Number(row.base_amount) || 0,
            tdsRate: Number(row.tax_rate) || 0,
            tdsAmount: Number(row.tax_amount) || 0,
            status: row.status || "filed",
          });
        }
      }

      // Compute pending TDS from payment vouchers
      const paymentVouchers = allVouchers.filter(
        (v) => v.voucher_type === "Payment" || v.voucher_type === "Journal"
      );
      const pendingTDSEntries = computeTDSFromVouchers(paymentVouchers, filedTDSEntries);

      // Compute pending TCS from sales vouchers
      const salesVouchers = allVouchers.filter((v) => v.voucher_type === "Sales");
      const pendingTCSEntries = computeTCSFromVouchers(salesVouchers, filedTCSEntries);

      setDeductees([...filedTDSEntries, ...pendingTDSEntries]);
      setNonResidents(filedNonResidentEntries);
      setTCSEntries([...filedTCSEntries, ...pendingTCSEntries]);
    } catch (err: any) {
      console.error("Failed to fetch TDS/TCS data:", err);
      toast.error(err?.message || "Failed to load TDS/TCS data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCompany?.id, selectedFY]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Derived Data ────────────────────────────────────────────────────────

  const filteredDeductees = useMemo(() => {
    return deductees.filter((d) => {
      const matchesSearch =
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.pan.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [deductees, searchQuery, statusFilter]);

  const filteredNonResidents = useMemo(() => {
    return nonResidents.filter((nr) => {
      const matchesSearch =
        nr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        nr.pan.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || nr.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [nonResidents, searchQuery, statusFilter]);

  const filteredTCS = useMemo(() => {
    return tcsEntries.filter((t) => {
      const matchesSearch =
        t.collecteeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.pan.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tcsEntries, searchQuery, statusFilter]);

  const dashboardStats = useMemo(() => {
    const totalTDSDeducted = deductees.reduce((sum, d) => sum + d.tdsAmount, 0);
    const totalTCSCollected = tcsEntries.reduce((sum, t) => sum + t.tcsAmount, 0);
    const pendingTDSPayments = deductees.filter((d) => d.status === "pending" || d.status === "overdue").length;
    const pendingTCSPayments = tcsEntries.filter((t) => t.status === "pending" || t.status === "overdue").length;
    const totalDeductors = new Set(deductees.map((d) => d.pan)).size;
    const totalCollectees = new Set(tcsEntries.map((t) => t.pan)).size;
    const totalVouchers = vouchers.length;
    const totalPaymentValue = vouchers
      .filter((v) => v.voucher_type === "Payment")
      .reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
    const totalSalesValue = vouchers
      .filter((v) => v.voucher_type === "Sales")
      .reduce((s, v) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0);
    return {
      totalTDSDeducted,
      totalTCSCollected,
      pendingTDSPayments,
      pendingTCSPayments,
      totalDeductors,
      totalCollectees,
      totalVouchers,
      totalPaymentValue,
      totalSalesValue,
    };
  }, [deductees, tcsEntries, vouchers]);

  const calculatorResult = useMemo(() => {
    const sectionData = TDS_SECTIONS[calcInputs.section];
    if (!sectionData) return null;
    const rate = calcInputs.isResident ? sectionData.residentRate : sectionData.nonResidentRate;
    const effectiveRate = calcInputs.panAvailable ? rate : rate * 2;
    const tdsAmount = calculateTDS(calcInputs.baseAmount, effectiveRate);
    const surchargeRate = calculateSurcharge(calcInputs.baseAmount);
    const surchargeAmount = Math.round((tdsAmount * surchargeRate) / 100);
    const cessAmount = calculateCess(tdsAmount + surchargeAmount);
    const totalDeduction = tdsAmount + surchargeAmount + cessAmount;
    const netPayable = calcInputs.baseAmount - totalDeduction;
    return { effectiveRate, tdsAmount, surchargeRate, surchargeAmount, cessAmount, totalDeduction, netPayable };
  }, [calcInputs]);

  const upcomingDeadlines = useMemo(() => {
    const now = new Date();
    return complianceItems
      .map((item) => {
        const dueDate = parseISO(item.dueDate);
        const daysLeft = differenceInDays(dueDate, now);
        let status: ComplianceItem["status"] = "upcoming";
        if (daysLeft < 0) status = "overdue";
        else if (daysLeft <= 7) status = "upcoming";
        return { ...item, status, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [complianceItems]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleFYChange = useCallback(
    (fy: string) => {
      setSelectedFY(fy);
      setComplianceItems(getComplianceDueDates(fy));
    },
    []
  );

  const handleRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  const handleAddDeductee = useCallback(() => {
    setEditingDeductee(null);
    setShowDeducteeForm(true);
  }, []);

  const handleEditDeductee = useCallback((entry: DeducteeEntry) => {
    setEditingDeductee(entry);
    setShowDeducteeForm(true);
  }, []);

  const handleSaveDeductee = useCallback(
    async (entry: Omit<DeducteeEntry, "id" | "tdsAmount">) => {
      if (!isValidPAN(entry.pan)) {
        toast.error("Invalid PAN format. Must be 5 letters + 4 digits + 1 letter.");
        return;
      }
      if (entry.baseAmount <= 0) {
        toast.error("Base amount must be greater than 0");
        return;
      }
      const tdsAmount = calculateTDS(entry.baseAmount, entry.tdsRate);

      try {
        if (editingDeductee) {
          // Update existing entry — if it's from tds_tcs_entries, update there
          if (!editingDeductee.id.startsWith("pending_")) {
            const { error } = await supabase
              .from("tds_tcs_entries")
              .update({
                party_name: entry.name,
                pan: entry.pan,
                section: entry.section,
                entry_date: entry.paymentDate,
                base_amount: entry.baseAmount,
                tax_rate: entry.tdsRate,
                tax_amount: tdsAmount,
                status: entry.status,
              })
              .eq("id", editingDeductee.id);
            if (error) throw error;
          }
          setDeductees((prev) =>
            prev.map((d) => (d.id === editingDeductee.id ? { ...entry, id: editingDeductee.id, tdsAmount } : d))
          );
          toast.success("Deductee entry updated");
        } else {
          // Insert new filed entry
          const { error } = await supabase.from("tds_tcs_entries").insert({
            company_id: selectedCompany?.id,
            entry_type: "tds",
            party_name: entry.name,
            pan: entry.pan,
            section: entry.section,
            entry_date: entry.paymentDate,
            base_amount: entry.baseAmount,
            tax_rate: entry.tdsRate,
            tax_amount: tdsAmount,
            status: entry.status,
            is_non_resident: false,
          });
          if (error) throw error;
          toast.success("Deductee entry added");
          fetchData(true);
          return;
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to save entry");
        return;
      }

      setShowDeducteeForm(false);
      setEditingDeductee(null);
    },
    [editingDeductee, selectedCompany?.id, fetchData]
  );

  const handleRemoveDeductee = useCallback(
    async (id: string) => {
      try {
        if (!id.startsWith("pending_")) {
          const { error } = await supabase.from("tds_tcs_entries").delete().eq("id", id);
          if (error) throw error;
        }
        setDeductees((prev) => prev.filter((d) => d.id !== id));
        toast.success("Entry removed");
      } catch (err: any) {
        toast.error(err?.message || "Failed to remove entry");
      }
    },
    []
  );

  const handleAddNonResident = useCallback(() => {
    setEditingNonResident(null);
    setShowNonResidentForm(true);
  }, []);

  const handleEditNonResident = useCallback((entry: NonResidentEntry) => {
    setEditingNonResident(entry);
    setShowNonResidentForm(true);
  }, []);

  const handleSaveNonResident = useCallback(
    async (entry: Omit<NonResidentEntry, "id" | "tdsAmount">) => {
      if (!isValidPAN(entry.pan)) {
        toast.error("Invalid PAN format");
        return;
      }
      const tdsAmount = calculateTDS(entry.baseAmount, entry.tdsRate);

      try {
        if (editingNonResident) {
          if (!editingNonResident.id.startsWith("pending_")) {
            const { error } = await supabase
              .from("tds_tcs_entries")
              .update({
                party_name: entry.name,
                pan: entry.pan,
                section: entry.section,
                entry_date: entry.paymentDate,
                base_amount: entry.baseAmount,
                tax_rate: entry.tdsRate,
                tax_amount: tdsAmount,
                status: entry.status,
                nationality: entry.nationality,
                tax_treaty_country: entry.taxTreatyCountry,
                article_number: entry.articleNumber,
              })
              .eq("id", editingNonResident.id);
            if (error) throw error;
          }
          setNonResidents((prev) =>
            prev.map((nr) => (nr.id === editingNonResident.id ? { ...entry, id: editingNonResident.id, tdsAmount } : nr))
          );
          toast.success("Non-resident entry updated");
        } else {
          const { error } = await supabase.from("tds_tcs_entries").insert({
            company_id: selectedCompany?.id,
            entry_type: "tds",
            party_name: entry.name,
            pan: entry.pan,
            section: entry.section,
            entry_date: entry.paymentDate,
            base_amount: entry.baseAmount,
            tax_rate: entry.tdsRate,
            tax_amount: tdsAmount,
            status: entry.status,
            is_non_resident: true,
            nationality: entry.nationality,
            tax_treaty_country: entry.taxTreatyCountry,
            article_number: entry.articleNumber,
          });
          if (error) throw error;
          toast.success("Non-resident entry added");
          fetchData(true);
          return;
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to save entry");
        return;
      }

      setShowNonResidentForm(false);
      setEditingNonResident(null);
    },
    [editingNonResident, selectedCompany?.id, fetchData]
  );

  const handleRemoveNonResident = useCallback(
    async (id: string) => {
      try {
        if (!id.startsWith("pending_")) {
          const { error } = await supabase.from("tds_tcs_entries").delete().eq("id", id);
          if (error) throw error;
        }
        setNonResidents((prev) => prev.filter((nr) => nr.id !== id));
        toast.success("Entry removed");
      } catch (err: any) {
        toast.error(err?.message || "Failed to remove entry");
      }
    },
    []
  );

  const handleAddTCS = useCallback(() => {
    setEditingTCS(null);
    setShowTCSForm(true);
  }, []);

  const handleEditTCS = useCallback((entry: TCSEntry) => {
    setEditingTCS(entry);
    setShowTCSForm(true);
  }, []);

  const handleSaveTCS = useCallback(
    async (entry: Omit<TCSEntry, "id" | "tcsAmount" | "certificateGenerated">) => {
      if (!isValidPAN(entry.pan)) {
        toast.error("Invalid PAN format");
        return;
      }
      const tcsAmount = calculateTDS(entry.baseAmount, entry.tcsRate);

      try {
        if (editingTCS) {
          if (!editingTCS.id.startsWith("pending_tcs_")) {
            const { error } = await supabase
              .from("tds_tcs_entries")
              .update({
                party_name: entry.collecteeName,
                pan: entry.pan,
                section: entry.section,
                entry_date: entry.paymentDate,
                base_amount: entry.baseAmount,
                tax_rate: entry.tcsRate,
                tax_amount: tcsAmount,
                status: entry.status,
              })
              .eq("id", editingTCS.id);
            if (error) throw error;
          }
          setTCSEntries((prev) =>
            prev.map((t) =>
              t.id === editingTCS.id ? { ...entry, id: editingTCS.id, tcsAmount, certificateGenerated: t.certificateGenerated } : t
            )
          );
          toast.success("TCS entry updated");
        } else {
          const { error } = await supabase.from("tds_tcs_entries").insert({
            company_id: selectedCompany?.id,
            entry_type: "tcs",
            party_name: entry.collecteeName,
            pan: entry.pan,
            section: entry.section,
            entry_date: entry.paymentDate,
            base_amount: entry.baseAmount,
            tax_rate: entry.tcsRate,
            tax_amount: tcsAmount,
            status: entry.status,
            certificate_generated: false,
          });
          if (error) throw error;
          toast.success("TCS entry added");
          fetchData(true);
          return;
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to save entry");
        return;
      }

      setShowTCSForm(false);
      setEditingTCS(null);
    },
    [editingTCS, selectedCompany?.id, fetchData]
  );

  const handleRemoveTCS = useCallback(
    async (id: string) => {
      try {
        if (!id.startsWith("pending_tcs_")) {
          const { error } = await supabase.from("tds_tcs_entries").delete().eq("id", id);
          if (error) throw error;
        }
        setTCSEntries((prev) => prev.filter((t) => t.id !== id));
        toast.success("Entry removed");
      } catch (err: any) {
        toast.error(err?.message || "Failed to remove entry");
      }
    },
    []
  );

  const handleGenerateCertificate = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from("tds_tcs_entries")
          .update({ certificate_generated: true })
          .eq("id", id);
        if (error) throw error;
        setTCSEntries((prev) =>
          prev.map((t) => (t.id === id ? { ...t, certificateGenerated: true } : t))
        );
        toast.success("TCS Certificate generated");
      } catch (err: any) {
        toast.error(err?.message || "Failed to generate certificate");
      }
    },
    []
  );

  const handleMarkFiled = useCallback(
    async (id: string, type: "tds" | "tcs" | "non_resident") => {
      try {
        const { error } = await supabase
          .from("tds_tcs_entries")
          .update({ status: "filed" })
          .eq("id", id);
        if (error) throw error;

        if (type === "tcs") {
          setTCSEntries((prev) =>
            prev.map((t) => (t.id === id ? { ...t, status: "filed" as const } : t))
          );
        } else {
          setDeductees((prev) =>
            prev.map((d) => (d.id === id ? { ...d, status: "filed" as const } : d))
          );
        }
        toast.success("Entry marked as filed");
      } catch (err: any) {
        toast.error(err?.message || "Failed to update status");
      }
    },
    []
  );

  const handleExportDeductees = useCallback(() => {
    exportToCSV(
      filteredDeductees.map((d) => ({
        Name: d.name,
        PAN: d.pan,
        Section: d.section,
        "Payment Date": d.paymentDate,
        "Base Amount": d.baseAmount,
        "TDS Rate (%)": d.tdsRate,
        "TDS Amount": d.tdsAmount,
        Status: d.status,
      })),
      `Form26Q_${selectedQuarter}_${selectedFY}`
    );
  }, [filteredDeductees, selectedQuarter, selectedFY]);

  const handleExportNonResidents = useCallback(() => {
    exportToCSV(
      filteredNonResidents.map((nr) => ({
        Name: nr.name,
        PAN: nr.pan,
        Section: nr.section,
        Nationality: nr.nationality,
        "Tax Treaty Country": nr.taxTreatyCountry,
        "Article Number": nr.articleNumber,
        "Payment Date": nr.paymentDate,
        "Base Amount": nr.baseAmount,
        "TDS Rate (%)": nr.tdsRate,
        "TDS Amount": nr.tdsAmount,
        Status: nr.status,
      })),
      `Form27Q_${selectedQuarter}_${selectedFY}`
    );
  }, [filteredNonResidents, selectedQuarter, selectedFY]);

  const handleExportTCS = useCallback(() => {
    exportToCSV(
      filteredTCS.map((t) => ({
        "Collectee Name": t.collecteeName,
        PAN: t.pan,
        Section: t.section,
        "Payment Date": t.paymentDate,
        "Base Amount": t.baseAmount,
        "TCS Rate (%)": t.tcsRate,
        "TCS Amount": t.tcsAmount,
        Status: t.status,
        "Certificate Generated": t.certificateGenerated ? "Yes" : "No",
      })),
      `TCS_${selectedQuarter}_${selectedFY}`
    );
  }, [filteredTCS, selectedQuarter, selectedFY]);

  // ─── Tab Config ──────────────────────────────────────────────────────────

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "form26q", label: "Form 26Q", icon: FileText },
    { id: "form27q", label: "Form 27Q", icon: FileText },
    { id: "tcs", label: "TCS Collection", icon: IndianRupee },
    { id: "calculator", label: "TDS Calculator", icon: Calculator },
    { id: "calendar", label: "Compliance Calendar", icon: CalendarDays },
  ];

  // ─── Loading State ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[200px] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="text-cyan-400 animate-spin" />
          <p className="text-zinc-400 text-[11px] md:text-sm">Loading TDS/TCS data...</p>
        </div>
      </div>
    );
  }

  if (!selectedCompany) {
    return (
      <div className="min-h-[200px] text-white flex items-center justify-center">
        <p className="text-zinc-400 text-[11px] md:text-sm">Please select a company first.</p>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-2 py-2 md:px-4 md:py-4">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <IndianRupee size={18} className="text-cyan-400 md:hidden" />
                <IndianRupee size={20} className="text-cyan-400 hidden md:block" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold">TDS / TCS Integration</h1>
                <p className="text-[11px] md:text-sm text-zinc-400 hidden md:block">Tax Deducted at Source & Tax Collected at Source</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] md:text-sm text-zinc-400">
              <span className="hidden sm:inline">FY {selectedFY}</span>
              <span className="hidden sm:inline text-zinc-600">|</span>
              <span className="hidden sm:inline">{selectedQuarter}</span>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white disabled:opacity-50"
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 -mb-px scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 md:gap-2 px-2 py-1.5 text-[11px] md:px-4 md:py-2.5 md:text-sm rounded-lg font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/50 border border-transparent"
                  }`}
                >
                  <Icon size={14} className="md:hidden" />
                  <Icon size={16} className="hidden md:block" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-2 py-3 md:px-4 md:py-6">
        <AnimatePresence mode="wait">
          {/* ─── Dashboard Tab ────────────────────────────────────────────── */}
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-6 md:mb-8">
                <SummaryCard
                  icon={TrendingDown}
                  label="Total TDS Deducted"
                  value={formatCurrency(dashboardStats.totalTDSDeducted)}
                  color="bg-cyan-500/10 text-cyan-400"
                  delay={0}
                />
                <SummaryCard
                  icon={TrendingUp}
                  label="Total TCS Collected"
                  value={formatCurrency(dashboardStats.totalTCSCollected)}
                  color="bg-emerald-500/10 text-emerald-400"
                  delay={0.1}
                />
                <SummaryCard
                  icon={Clock}
                  label="Pending TDS Payments"
                  value={String(dashboardStats.pendingTDSPayments)}
                  color="bg-amber-500/10 text-amber-400"
                  delay={0.2}
                />
                <SummaryCard
                  icon={Clock}
                  label="Pending TCS Payments"
                  value={String(dashboardStats.pendingTCSPayments)}
                  color="bg-amber-500/10 text-amber-400"
                  delay={0.3}
                />
                <SummaryCard
                  icon={Building2}
                  label="Total Vouchers (FY)"
                  value={String(dashboardStats.totalVouchers)}
                  color="bg-violet-500/10 text-violet-400"
                  delay={0.4}
                />
                <SummaryCard
                  icon={IndianRupee}
                  label="Total Payment Value"
                  value={formatCurrency(dashboardStats.totalPaymentValue)}
                  color="bg-pink-500/10 text-pink-400"
                  delay={0.5}
                />
              </div>

              {/* Quick Overview Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Recent TDS Entries */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
                >
                  <div className="px-3 py-3 md:px-5 md:py-4 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="font-semibold text-[13px] md:text-base">Recent TDS Entries</h3>
                    <button
                      onClick={() => setActiveTab("form26q")}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      View All
                    </button>
                  </div>
                  <div className="divide-y divide-zinc-800/50">
                    {deductees.length === 0 ? (
                      <div className="px-3 py-6 md:px-5 md:py-8 text-center text-zinc-500 text-[11px] md:text-sm">
                        No TDS entries found
                      </div>
                    ) : (
                      deductees.slice(0, 5).map((d) => (
                        <div key={d.id} className="px-3 py-2.5 md:px-5 md:py-3 flex items-center justify-between">
                          <div>
                            <p className="text-[11px] md:text-sm font-medium">{d.name}</p>
                            <p className="text-[10px] md:text-xs text-zinc-400">{d.pan} &middot; {d.section}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] md:text-sm font-medium">{formatCurrency(d.tdsAmount)}</p>
                            <StatusBadge status={d.status} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>

                {/* Recent TCS Entries */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
                >
                  <div className="px-3 py-3 md:px-5 md:py-4 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="font-semibold text-[13px] md:text-base">Recent TCS Entries</h3>
                    <button
                      onClick={() => setActiveTab("tcs")}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      View All
                    </button>
                  </div>
                  <div className="divide-y divide-zinc-800/50">
                    {tcsEntries.length === 0 ? (
                      <div className="px-3 py-6 md:px-5 md:py-8 text-center text-zinc-500 text-[11px] md:text-sm">
                        No TCS entries found
                      </div>
                    ) : (
                      tcsEntries.slice(0, 5).map((t) => (
                        <div key={t.id} className="px-3 py-2.5 md:px-5 md:py-3 flex items-center justify-between">
                          <div>
                            <p className="text-[11px] md:text-sm font-medium">{t.collecteeName}</p>
                            <p className="text-[10px] md:text-xs text-zinc-400">{t.pan} &middot; {t.section}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] md:text-sm font-medium">{formatCurrency(t.tcsAmount)}</p>
                            <StatusBadge status={t.status} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Upcoming Deadlines */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.8 }}
                className="mt-4 md:mt-6 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
              >
                <div className="px-3 py-3 md:px-5 md:py-4 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="font-semibold text-[13px] md:text-base">Upcoming Compliance Deadlines</h3>
                  <button
                    onClick={() => setActiveTab("calendar")}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    View Calendar
                  </button>
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {upcomingDeadlines.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className={`px-3 py-2.5 md:px-5 md:py-3 flex items-center justify-between ${
                        item.status === "overdue" ? "bg-red-500/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 md:gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            item.status === "overdue"
                              ? "bg-red-400"
                              : item.daysLeft <= 7
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <div>
                          <p className="text-[11px] md:text-sm font-medium">{item.description}</p>
                          <p className="text-[10px] md:text-xs text-zinc-400">
                            Due: {format(parseISO(item.dueDate), "dd MMM yyyy")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={item.status} />
                        {item.daysLeft >= 0 && (
                          <p className="text-[10px] md:text-xs text-zinc-500 mt-1">{item.daysLeft} days left</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ─── Form 26Q Tab ────────────────────────────────────────────── */}
          {activeTab === "form26q" && (
            <motion.div
              key="form26q"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Quarter & FY Selector */}
              <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4 md:mb-6">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <label className="text-[11px] md:text-sm text-zinc-400">Quarter:</label>
                  <select
                    value={selectedQuarter}
                    onChange={(e) => setSelectedQuarter(e.target.value as Quarter)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {QUARTERS.map((q) => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 md:gap-2">
                  <label className="text-[11px] md:text-sm text-zinc-400">FY:</label>
                  <select
                    value={selectedFY}
                    onChange={(e) => handleFYChange(e.target.value)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {FINANCIAL_YEARS.map((fy) => (
                      <option key={fy} value={fy}>
                        {fy}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3 md:mb-4">
                <div className="relative flex-1 min-w-[140px] md:min-w-[200px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 md:left-3" />
                  <input
                    type="text"
                    placeholder="Search by name or PAN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-8 pr-2.5 py-1.5 md:pl-9 md:pr-3 md:py-2 text-[11px] md:text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 md:left-3" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg pl-8 pr-7 py-1.5 md:pl-9 md:pr-8 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none appearance-none"
                  >
                    <option value="all">All Status</option>
                    <option value="filed">Filed</option>
                    <option value="pending">Pending</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none md:right-2.5" />
                </div>
                <button
                  onClick={handleAddDeductee}
                  className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-black px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-sm font-medium transition-colors"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">Add Entry</span>
                  <span className="sm:hidden">Add</span>
                </button>
                <button
                  onClick={handleExportDeductees}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-sm font-medium transition-colors border border-zinc-700"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">Export</span>
                </button>
              </div>

              {/* Deductee Table */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Mobile card view */}
                <div className="md:hidden divide-y divide-zinc-800/50">
                  {filteredDeductees.length === 0 ? (
                    <div className="px-3 py-8 text-center text-zinc-500 text-[11px]">
                      No entries found. Click "Add" to create one.
                    </div>
                  ) : (
                    filteredDeductees.map((d) => (
                      <div key={d.id} className="px-2 py-2 border-b border-zinc-800/50 last:border-b-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-[11px] font-medium truncate">{d.name}</span>
                            <span className="text-[9px] font-mono text-zinc-500 shrink-0">{d.pan}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-medium text-cyan-400">{formatCurrency(d.tdsAmount)}</span>
                            <StatusBadge status={d.status} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                            <span className="bg-zinc-800/50 px-1 py-0.5 rounded">{d.section}</span>
                            <span>{format(parseISO(d.paymentDate), "dd MMM yy")}</span>
                            <span className="text-zinc-600">Base: {formatCurrency(d.baseAmount)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditDeductee(d)}
                              className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-white"
                            >
                              <Edit3 size={11} />
                            </button>
                            <button
                              onClick={() => handleRemoveDeductee(d.id)}
                              className="p-1 hover:bg-red-500/10 rounded transition-colors text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {filteredDeductees.length > 0 && (
                    <div className="px-3 py-2.5 bg-zinc-800/30 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-zinc-300">Total</span>
                      <span className="font-semibold text-cyan-400">
                        {formatCurrency(filteredDeductees.reduce((s, d) => s + d.tdsAmount, 0))}
                      </span>
                    </div>
                  )}
                </div>
                {/* Desktop table view */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">PAN</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Section</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Payment Date</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Base Amount</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Rate %</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">TDS Amount</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {filteredDeductees.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center text-zinc-500">
                            No entries found. Click "Add Entry" to create one.
                          </td>
                        </tr>
                      ) : (
                        filteredDeductees.map((d) => (
                          <tr key={d.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="px-4 py-3 font-medium">{d.name}</td>
                            <td className="px-4 py-3 font-mono text-xs">{d.pan}</td>
                            <td className="px-4 py-3">
                              <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{d.section}</span>
                            </td>
                            <td className="px-4 py-3 text-zinc-300">
                              {format(parseISO(d.paymentDate), "dd MMM yyyy")}
                            </td>
                            <td className="px-4 py-3 text-right">{formatCurrency(d.baseAmount)}</td>
                            <td className="px-4 py-3 text-right text-zinc-300">{d.tdsRate}%</td>
                            <td className="px-4 py-3 text-right font-medium text-cyan-400">
                              {formatCurrency(d.tdsAmount)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <StatusBadge status={d.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleEditDeductee(d)}
                                  className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleRemoveDeductee(d.id)}
                                  className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-zinc-400 hover:text-red-400"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredDeductees.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-zinc-700 bg-zinc-800/30">
                          <td colSpan={4} className="px-4 py-3 font-semibold text-zinc-300">Total</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(filteredDeductees.reduce((s, d) => s + d.baseAmount, 0))}
                          </td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-right font-semibold text-cyan-400">
                            {formatCurrency(filteredDeductees.reduce((s, d) => s + d.tdsAmount, 0))}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Deductee Form Modal */}
              <DeducteeFormModal
                show={showDeducteeForm}
                entry={editingDeductee}
                onSave={handleSaveDeductee}
                onClose={() => {
                  setShowDeducteeForm(false);
                  setEditingDeductee(null);
                }}
              />
            </motion.div>
          )}

          {/* ─── Form 27Q Tab ────────────────────────────────────────────── */}
          {activeTab === "form27q" && (
            <motion.div
              key="form27q"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Quarter & FY Selector */}
              <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4 md:mb-6">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <label className="text-[11px] md:text-sm text-zinc-400">Quarter:</label>
                  <select
                    value={selectedQuarter}
                    onChange={(e) => setSelectedQuarter(e.target.value as Quarter)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {QUARTERS.map((q) => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 md:gap-2">
                  <label className="text-[11px] md:text-sm text-zinc-400">FY:</label>
                  <select
                    value={selectedFY}
                    onChange={(e) => handleFYChange(e.target.value)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {FINANCIAL_YEARS.map((fy) => (
                      <option key={fy} value={fy}>
                        {fy}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3 md:mb-4">
                <div className="relative flex-1 min-w-[140px] md:min-w-[200px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 md:left-3" />
                  <input
                    type="text"
                    placeholder="Search by name or PAN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-8 pr-2.5 py-1.5 md:pl-9 md:pr-3 md:py-2 text-[11px] md:text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 md:left-3" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg pl-8 pr-7 py-1.5 md:pl-9 md:pr-8 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none appearance-none"
                  >
                    <option value="all">All Status</option>
                    <option value="filed">Filed</option>
                    <option value="pending">Pending</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none md:right-2.5" />
                </div>
                <button
                  onClick={handleAddNonResident}
                  className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-black px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-sm font-medium transition-colors"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">Add Entry</span>
                  <span className="sm:hidden">Add</span>
                </button>
                <button
                  onClick={handleExportNonResidents}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-sm font-medium transition-colors border border-zinc-700"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">Export</span>
                </button>
              </div>

              {/* Non-Resident Table */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Mobile card view */}
                <div className="md:hidden divide-y divide-zinc-800/50">
                  {filteredNonResidents.length === 0 ? (
                    <div className="px-3 py-8 text-center text-zinc-500 text-[11px]">
                      No entries found. Click "Add" to create one.
                    </div>
                  ) : (
                    filteredNonResidents.map((nr) => (
                      <div key={nr.id} className="px-2 py-2 border-b border-zinc-800/50 last:border-b-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-[11px] font-medium truncate">{nr.name}</span>
                            <span className="text-[9px] font-mono text-zinc-500 shrink-0">{nr.pan}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-medium text-cyan-400">{formatCurrency(nr.tdsAmount)}</span>
                            <StatusBadge status={nr.status} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                            <span className="bg-zinc-800/50 px-1 py-0.5 rounded">{nr.section}</span>
                            <span>{nr.nationality}</span>
                            {nr.taxTreatyCountry && <span>Treaty: {nr.taxTreatyCountry}</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditNonResident(nr)}
                              className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-white"
                            >
                              <Edit3 size={11} />
                            </button>
                            <button
                              onClick={() => handleRemoveNonResident(nr.id)}
                              className="p-1 hover:bg-red-500/10 rounded transition-colors text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {filteredNonResidents.length > 0 && (
                    <div className="px-3 py-2.5 bg-zinc-800/30 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-zinc-300">Total</span>
                      <span className="font-semibold text-cyan-400">
                        {formatCurrency(filteredNonResidents.reduce((s, nr) => s + nr.tdsAmount, 0))}
                      </span>
                    </div>
                  )}
                </div>
                {/* Desktop table view */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">PAN</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Section</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Nationality</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Treaty Country</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Article</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Base Amount</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Rate %</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">TDS Amount</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {filteredNonResidents.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="px-4 py-12 text-center text-zinc-500">
                            No entries found. Click "Add Entry" to create one.
                          </td>
                        </tr>
                      ) : (
                        filteredNonResidents.map((nr) => (
                          <tr key={nr.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="px-4 py-3 font-medium">{nr.name}</td>
                            <td className="px-4 py-3 font-mono text-xs">{nr.pan}</td>
                            <td className="px-4 py-3">
                              <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{nr.section}</span>
                            </td>
                            <td className="px-4 py-3 text-zinc-300">{nr.nationality}</td>
                            <td className="px-4 py-3 text-zinc-300">{nr.taxTreatyCountry}</td>
                            <td className="px-4 py-3 text-zinc-300">{nr.articleNumber}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(nr.baseAmount)}</td>
                            <td className="px-4 py-3 text-right text-zinc-300">{nr.tdsRate}%</td>
                            <td className="px-4 py-3 text-right font-medium text-cyan-400">
                              {formatCurrency(nr.tdsAmount)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <StatusBadge status={nr.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleEditNonResident(nr)}
                                  className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleRemoveNonResident(nr.id)}
                                  className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-zinc-400 hover:text-red-400"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredNonResidents.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-zinc-700 bg-zinc-800/30">
                          <td colSpan={6} className="px-4 py-3 font-semibold text-zinc-300">Total</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(filteredNonResidents.reduce((s, nr) => s + nr.baseAmount, 0))}
                          </td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-right font-semibold text-cyan-400">
                            {formatCurrency(filteredNonResidents.reduce((s, nr) => s + nr.tdsAmount, 0))}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Non-Resident Form Modal */}
              <NonResidentFormModal
                show={showNonResidentForm}
                entry={editingNonResident}
                onSave={handleSaveNonResident}
                onClose={() => {
                  setShowNonResidentForm(false);
                  setEditingNonResident(null);
                }}
              />
            </motion.div>
          )}

          {/* ─── TCS Collection Tab ────────────────────────────────────────── */}
          {activeTab === "tcs" && (
            <motion.div
              key="tcs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Quarter & FY Selector */}
              <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4 md:mb-6">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <label className="text-[11px] md:text-sm text-zinc-400">Quarter:</label>
                  <select
                    value={selectedQuarter}
                    onChange={(e) => setSelectedQuarter(e.target.value as Quarter)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {QUARTERS.map((q) => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 md:gap-2">
                  <label className="text-[11px] md:text-sm text-zinc-400">FY:</label>
                  <select
                    value={selectedFY}
                    onChange={(e) => handleFYChange(e.target.value)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {FINANCIAL_YEARS.map((fy) => (
                      <option key={fy} value={fy}>
                        {fy}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3 md:mb-4">
                <div className="relative flex-1 min-w-[140px] md:min-w-[200px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 md:left-3" />
                  <input
                    type="text"
                    placeholder="Search by name or PAN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-8 pr-2.5 py-1.5 md:pl-9 md:pr-3 md:py-2 text-[11px] md:text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 md:left-3" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg pl-8 pr-7 py-1.5 md:pl-9 md:pr-8 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none appearance-none"
                  >
                    <option value="all">All Status</option>
                    <option value="filed">Filed</option>
                    <option value="pending">Pending</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none md:right-2.5" />
                </div>
                <button
                  onClick={handleAddTCS}
                  className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-black px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-sm font-medium transition-colors"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">Add Entry</span>
                  <span className="sm:hidden">Add</span>
                </button>
                <button
                  onClick={handleExportTCS}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-sm font-medium transition-colors border border-zinc-700"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">Export</span>
                </button>
              </div>

              {/* TCS Table */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Mobile card view */}
                <div className="md:hidden divide-y divide-zinc-800/50">
                  {filteredTCS.length === 0 ? (
                    <div className="px-3 py-8 text-center text-zinc-500 text-[11px]">
                      No entries found. Click "Add" to create one.
                    </div>
                  ) : (
                    filteredTCS.map((t) => (
                      <div key={t.id} className="px-2 py-2 border-b border-zinc-800/50 last:border-b-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-[11px] font-medium truncate">{t.collecteeName}</span>
                            <span className="text-[9px] font-mono text-zinc-500 shrink-0">{t.pan}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-medium text-cyan-400">{formatCurrency(t.tcsAmount)}</span>
                            <StatusBadge status={t.status} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                            <span className="bg-zinc-800/50 px-1 py-0.5 rounded">{t.section}</span>
                            <span>{format(parseISO(t.paymentDate), "dd MMM yy")}</span>
                            <span className="text-zinc-600">Base: {formatCurrency(t.baseAmount)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {t.certificateGenerated ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400/70 text-[9px]">
                                <CheckCircle2 size={9} />
                              </span>
                            ) : (
                              <button
                                onClick={() => handleGenerateCertificate(t.id)}
                                className="text-[9px] text-cyan-400/70 hover:text-cyan-300"
                              >
                                <FileText size={11} />
                              </button>
                            )}
                            <button
                              onClick={() => handleEditTCS(t)}
                              className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-white"
                            >
                              <Edit3 size={11} />
                            </button>
                            <button
                              onClick={() => handleRemoveTCS(t.id)}
                              className="p-1 hover:bg-red-500/10 rounded transition-colors text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {filteredTCS.length > 0 && (
                    <div className="px-3 py-2.5 bg-zinc-800/30 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-zinc-300">Total</span>
                      <span className="font-semibold text-cyan-400">
                        {formatCurrency(filteredTCS.reduce((s, t) => s + t.tcsAmount, 0))}
                      </span>
                    </div>
                  )}
                </div>
                {/* Desktop table view */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Collectee Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">PAN</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Section</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Payment Date</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Base Amount</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Rate %</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">TCS Amount</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Certificate</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {filteredTCS.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-12 text-center text-zinc-500">
                            No entries found. Click "Add Entry" to create one.
                          </td>
                        </tr>
                      ) : (
                        filteredTCS.map((t) => (
                          <tr key={t.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="px-4 py-3 font-medium">{t.collecteeName}</td>
                            <td className="px-4 py-3 font-mono text-xs">{t.pan}</td>
                            <td className="px-4 py-3">
                              <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{t.section}</span>
                            </td>
                            <td className="px-4 py-3 text-zinc-300">
                              {format(parseISO(t.paymentDate), "dd MMM yyyy")}
                            </td>
                            <td className="px-4 py-3 text-right">{formatCurrency(t.baseAmount)}</td>
                            <td className="px-4 py-3 text-right text-zinc-300">{t.tcsRate}%</td>
                            <td className="px-4 py-3 text-right font-medium text-cyan-400">
                              {formatCurrency(t.tcsAmount)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {t.certificateGenerated ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                                  <CheckCircle2 size={12} />
                                  Generated
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleGenerateCertificate(t.id)}
                                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mx-auto"
                                >
                                  <FileText size={12} />
                                  Generate
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <StatusBadge status={t.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleEditTCS(t)}
                                  className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleRemoveTCS(t.id)}
                                  className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-zinc-400 hover:text-red-400"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredTCS.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-zinc-700 bg-zinc-800/30">
                          <td colSpan={4} className="px-4 py-3 font-semibold text-zinc-300">Total</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(filteredTCS.reduce((s, t) => s + t.baseAmount, 0))}
                          </td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-right font-semibold text-cyan-400">
                            {formatCurrency(filteredTCS.reduce((s, t) => s + t.tcsAmount, 0))}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* TCS Form Modal */}
              <TCSFormModal
                show={showTCSForm}
                entry={editingTCS}
                onSave={handleSaveTCS}
                onClose={() => {
                  setShowTCSForm(false);
                  setEditingTCS(null);
                }}
              />
            </motion.div>
          )}

          {/* ─── TDS Calculator Tab ───────────────────────────────────────── */}
          {activeTab === "calculator" && (
            <motion.div
              key="calculator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="max-w-3xl mx-auto"
            >
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 md:p-6 mb-4 md:mb-6">
                <h3 className="font-semibold mb-4 md:mb-6 flex items-center gap-2 text-[13px] md:text-base">
                  <Calculator size={16} className="text-cyan-400 md:hidden" />
                  <Calculator size={18} className="text-cyan-400 hidden md:block" />
                  TDS / TCS Quick Calculator
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {/* Inputs */}
                  <div className="space-y-3 md:space-y-4">
                    <div>
                      <label className="block text-[11px] md:text-xs text-zinc-400 mb-1.5">Section</label>
                      <select
                        value={calcInputs.section}
                        onChange={(e) => setCalcInputs((p) => ({ ...p, section: e.target.value }))}
                        className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 md:py-2.5 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                      >
                        {Object.entries(TDS_SECTIONS).map(([key, val]) => (
                          <option key={key} value={key}>
                            {key} - {val.label} ({calcInputs.isResident ? val.residentRate : val.nonResidentRate}%)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] md:text-xs text-zinc-400 mb-1.5">Base Amount (₹)</label>
                      <input
                        type="number"
                        value={calcInputs.baseAmount}
                        onChange={(e) => setCalcInputs((p) => ({ ...p, baseAmount: Number(e.target.value) }))}
                        className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 md:py-2.5 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                        min={0}
                      />
                    </div>

                    <div className="flex gap-3 md:gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={calcInputs.panAvailable}
                          onChange={(e) => setCalcInputs((p) => ({ ...p, panAvailable: e.target.checked }))}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-cyan-400 focus:ring-cyan-500"
                        />
                        <span className="text-[11px] md:text-sm text-zinc-300">PAN Available</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={calcInputs.isResident}
                          onChange={(e) => setCalcInputs((p) => ({ ...p, isResident: e.target.checked }))}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-cyan-400 focus:ring-cyan-500"
                        />
                        <span className="text-[11px] md:text-sm text-zinc-300">Resident</span>
                      </label>
                    </div>

                    {!calcInputs.panAvailable && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-[10px] md:text-xs text-amber-400">
                        PAN not available - TDS rate will be charged at 2x (higher rate as per Section 206AA)
                      </div>
                    )}
                  </div>

                  {/* Results */}
                  {calculatorResult && (
                    <div className="bg-zinc-800/30 rounded-xl p-3 md:p-5 border border-zinc-700/50">
                      <h4 className="text-[11px] md:text-sm font-medium text-zinc-300 mb-3 md:mb-4">Calculation Breakdown</h4>
                      <div className="space-y-2 md:space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] md:text-sm text-zinc-400">Base Amount</span>
                          <span className="text-[11px] md:text-sm font-medium">{formatCurrency(calcInputs.baseAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] md:text-sm text-zinc-400">TDS Rate</span>
                          <span className="text-[11px] md:text-sm font-medium">{calculatorResult.effectiveRate}%</span>
                        </div>
                        <div className="h-px bg-zinc-700" />
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] md:text-sm text-zinc-400">TDS Amount</span>
                          <span className="text-[11px] md:text-sm font-medium text-cyan-400">
                            {formatCurrency(calculatorResult.tdsAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] md:text-sm text-zinc-400">
                            Surcharge ({calculatorResult.surchargeRate}%)
                          </span>
                          <span className="text-[11px] md:text-sm font-medium">{formatCurrency(calculatorResult.surchargeAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] md:text-sm text-zinc-400">Health & Education Cess (4%)</span>
                          <span className="text-[11px] md:text-sm font-medium">{formatCurrency(calculatorResult.cessAmount)}</span>
                        </div>
                        <div className="h-px bg-zinc-700" />
                        <div className="flex justify-between items-center bg-cyan-500/10 -mx-3 px-3 py-2 md:-mx-5 md:px-5 md:py-3 rounded-b-xl">
                          <span className="text-[11px] md:text-sm font-semibold text-cyan-400">Total Deduction</span>
                          <span className="text-base md:text-lg font-bold text-cyan-400">
                            {formatCurrency(calculatorResult.totalDeduction)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1 md:pt-2">
                          <span className="text-[11px] md:text-sm font-semibold text-emerald-400">Net Payable to Deductee</span>
                          <span className="text-base md:text-lg font-bold text-emerald-400">
                            {formatCurrency(calculatorResult.netPayable)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Rate Reference Table */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-3 py-3 md:px-5 md:py-4 border-b border-zinc-800">
                  <h3 className="font-semibold flex items-center gap-2 text-[13px] md:text-base">
                    <Eye size={16} className="text-cyan-400 md:hidden" />
                    <Eye size={18} className="text-cyan-400 hidden md:block" />
                    TDS Rate Reference
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] md:text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Section</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Description</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Resident %</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Non-Resident %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {Object.entries(TDS_SECTIONS).map(([key, val]) => (
                        <tr key={key} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="px-3 py-2 md:px-4 md:py-2.5 font-mono text-[10px] md:text-xs">{key}</td>
                          <td className="px-3 py-2 md:px-4 md:py-2.5 text-zinc-300">{val.label}</td>
                          <td className="px-3 py-2 md:px-4 md:py-2.5 text-right">{val.residentRate}%</td>
                          <td className="px-3 py-2 md:px-4 md:py-2.5 text-right">{val.nonResidentRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Compliance Calendar Tab ──────────────────────────────────── */}
          {activeTab === "calendar" && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* FY Selector */}
              <div className="flex items-center gap-2 md:gap-4 mb-4 md:mb-6">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <label className="text-[11px] md:text-sm text-zinc-400">FY:</label>
                  <select
                    value={selectedFY}
                    onChange={(e) => handleFYChange(e.target.value)}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-1.5 md:px-3 md:py-2 text-[11px] md:text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {FINANCIAL_YEARS.map((fy) => (
                      <option key={fy} value={fy}>
                        {fy}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setComplianceItems(getComplianceDueDates(selectedFY))}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1.5 md:px-3 md:py-2 rounded-lg text-[11px] md:text-sm transition-colors border border-zinc-700"
                >
                  <RefreshCw size={12} className="md:hidden" />
                  <RefreshCw size={14} className="hidden md:block" />
                  <span className="hidden md:inline">Refresh</span>
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg md:rounded-xl p-2 md:p-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-7 h-7 md:w-10 md:h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <AlertTriangle size={12} className="text-red-400 md:hidden" />
                      <AlertTriangle size={18} className="text-red-400 hidden md:block" />
                    </div>
                    <div>
                      <p className="text-sm md:text-2xl font-bold text-red-400">
                        {upcomingDeadlines.filter((d) => d.status === "overdue").length}
                      </p>
                      <p className="text-[9px] md:text-xs text-zinc-400">Overdue</p>
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg md:rounded-xl p-2 md:p-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-7 h-7 md:w-10 md:h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Clock size={12} className="text-amber-400 md:hidden" />
                      <Clock size={18} className="text-amber-400 hidden md:block" />
                    </div>
                    <div>
                      <p className="text-sm md:text-2xl font-bold text-amber-400">
                        {upcomingDeadlines.filter((d) => d.status === "upcoming" && d.daysLeft <= 7).length}
                      </p>
                      <p className="text-[9px] md:text-xs text-zinc-400">Due in 7d</p>
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg md:rounded-xl p-2 md:p-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-7 h-7 md:w-10 md:h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 size={12} className="text-emerald-400 md:hidden" />
                      <CheckCircle2 size={18} className="text-emerald-400 hidden md:block" />
                    </div>
                    <div>
                      <p className="text-sm md:text-2xl font-bold text-emerald-400">
                        {upcomingDeadlines.filter((d) => d.status === "upcoming" && d.daysLeft > 7).length}
                      </p>
                      <p className="text-[9px] md:text-xs text-zinc-400">On Track</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Calendar List */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-2 py-2.5 md:px-5 md:py-4 border-b border-zinc-800">
                  <h3 className="font-semibold flex items-center gap-2 text-[13px] md:text-base">
                    <CalendarDays size={14} className="text-cyan-400 md:hidden" />
                    <CalendarDays size={18} className="text-cyan-400 hidden md:block" />
                    Compliance Calendar - FY {selectedFY}
                  </h3>
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {upcomingDeadlines.map((item) => (
                    <div
                      key={item.id}
                      className={`px-2 py-2 md:px-5 md:py-4 flex items-center justify-between transition-colors ${
                        item.status === "overdue"
                          ? "bg-red-500/5 hover:bg-red-500/10"
                          : item.daysLeft <= 7
                          ? "bg-amber-500/5 hover:bg-amber-500/10"
                          : "hover:bg-zinc-800/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
                        <div
                          className={`w-2 h-2 md:w-3 md:h-3 rounded-full shrink-0 ${
                            item.status === "overdue"
                              ? "bg-red-400 animate-pulse"
                              : item.daysLeft <= 7
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className={`text-[11px] md:text-sm font-medium truncate ${item.status === "overdue" ? "text-red-300" : ""}`}>
                            {item.description}
                          </p>
                          <div className="flex items-center gap-1.5 md:gap-3 mt-0.5 md:mt-1">
                            <span className="text-[9px] md:text-xs text-zinc-400">
                              {format(parseISO(item.dueDate), "dd MMM yy")}
                            </span>
                            <span
                              className={`text-[8px] md:text-xs px-1 md:px-2 py-0.5 rounded-full shrink-0 ${
                                item.type === "tds_payment"
                                  ? "bg-sky-500/10 text-sky-400"
                                  : item.type === "tds_return"
                                  ? "bg-violet-500/10 text-violet-400"
                                  : "bg-pink-500/10 text-pink-400"
                              }`}
                            >
                              {item.type === "tds_payment" ? "Pay" : item.type === "tds_return" ? "Ret" : "TCS"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <StatusBadge status={item.status} />
                        {item.daysLeft >= 0 && (
                          <p className="text-[9px] md:text-xs text-zinc-500 mt-0.5 md:mt-1">
                            {item.daysLeft === 0
                              ? "Due today!"
                              : item.daysLeft === 1
                              ? "1d left"
                              : `${item.daysLeft}d left`}
                          </p>
                        )}
                        {item.daysLeft < 0 && (
                          <p className="text-[9px] md:text-xs text-red-400 mt-0.5">{Math.abs(item.daysLeft)}d overdue</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Form Modals ─────────────────────────────────────────────────────────────

function DeducteeFormModal({
  show,
  entry,
  onSave,
  onClose,
}: {
  show: boolean;
  entry: DeducteeEntry | null;
  onSave: (entry: Omit<DeducteeEntry, "id" | "tdsAmount">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: entry?.name ?? "",
    pan: entry?.pan ?? "",
    section: entry?.section ?? "194C",
    paymentDate: entry?.paymentDate ?? format(new Date(), "yyyy-MM-dd"),
    baseAmount: entry?.baseAmount ?? 0,
    tdsRate: entry?.tdsRate ?? TDS_SECTIONS["194C"].residentRate,
    status: entry?.status ?? "pending" as const,
  });

  const handleSectionChange = (section: string) => {
    const sectionData = TDS_SECTIONS[section];
    setForm((p) => ({ ...p, section, tdsRate: sectionData?.residentRate ?? 0 }));
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">
                {entry ? "Edit Deductee Entry" : "Add Deductee Entry"}
              </h3>
              <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Deductee Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="Enter deductee name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">PAN *</label>
                  <input
                    type="text"
                    value={form.pan}
                    onChange={(e) => setForm((p) => ({ ...p, pan: e.target.value.toUpperCase() }))}
                    className={`w-full bg-zinc-800/50 border rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none ${
                      form.pan && !isValidPAN(form.pan) ? "border-red-500 focus:border-red-500" : "border-zinc-700 focus:border-cyan-500"
                    }`}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                  {form.pan && !isValidPAN(form.pan) && (
                    <p className="text-xs text-red-400 mt-1">Invalid PAN format</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Section *</label>
                  <select
                    value={form.section}
                    onChange={(e) => handleSectionChange(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {Object.entries(TDS_SECTIONS).map(([key, val]) => (
                      <option key={key} value={key}>
                        {key} - {val.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as DeducteeEntry["status"] }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="pending">Pending</option>
                    <option value="filed">Filed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Base Amount (₹) *</label>
                  <input
                    type="number"
                    value={form.baseAmount || ""}
                    onChange={(e) => setForm((p) => ({ ...p, baseAmount: Number(e.target.value) }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    min={0}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">TDS Rate (%)</label>
                  <input
                    type="number"
                    value={form.tdsRate}
                    onChange={(e) => setForm((p) => ({ ...p, tdsRate: Number(e.target.value) }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    min={0}
                    max={100}
                    step={0.5}
                  />
                </div>
              </div>

              {form.baseAmount > 0 && (
                <div className="bg-zinc-800/30 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Calculated TDS:</span>
                  <span className="text-lg font-bold text-cyan-400">
                    {formatCurrency(calculateTDS(form.baseAmount, form.tdsRate))}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!form.name.trim()) {
                    toast.error("Please enter deductee name");
                    return;
                  }
                  if (!isValidPAN(form.pan)) {
                    toast.error("Please enter a valid PAN");
                    return;
                  }
                  if (form.baseAmount <= 0) {
                    toast.error("Please enter a valid base amount");
                    return;
                  }
                  onSave(form);
                }}
                className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Save size={16} />
                {entry ? "Update" : "Save"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NonResidentFormModal({
  show,
  entry,
  onSave,
  onClose,
}: {
  show: boolean;
  entry: NonResidentEntry | null;
  onSave: (entry: Omit<NonResidentEntry, "id" | "tdsAmount">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: entry?.name ?? "",
    pan: entry?.pan ?? "",
    section: entry?.section ?? "195",
    paymentDate: entry?.paymentDate ?? format(new Date(), "yyyy-MM-dd"),
    baseAmount: entry?.baseAmount ?? 0,
    tdsRate: entry?.tdsRate ?? TDS_SECTIONS["195"].nonResidentRate,
    status: entry?.status ?? "pending" as const,
    nationality: entry?.nationality ?? "",
    taxTreatyCountry: entry?.taxTreatyCountry ?? "",
    articleNumber: entry?.articleNumber ?? "",
  });

  const handleSectionChange = (section: string) => {
    const sectionData = TDS_SECTIONS[section];
    setForm((p) => ({ ...p, section, tdsRate: sectionData?.nonResidentRate ?? 0 }));
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">
                {entry ? "Edit Non-Resident Entry" : "Add Non-Resident Entry"}
              </h3>
              <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Deductee Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="Enter deductee name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">PAN *</label>
                  <input
                    type="text"
                    value={form.pan}
                    onChange={(e) => setForm((p) => ({ ...p, pan: e.target.value.toUpperCase() }))}
                    className={`w-full bg-zinc-800/50 border rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none ${
                      form.pan && !isValidPAN(form.pan) ? "border-red-500 focus:border-red-500" : "border-zinc-700 focus:border-cyan-500"
                    }`}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                  {form.pan && !isValidPAN(form.pan) && (
                    <p className="text-xs text-red-400 mt-1">Invalid PAN format</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Section *</label>
                  <select
                    value={form.section}
                    onChange={(e) => handleSectionChange(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {["195", "196A", "196B", "196C", "196D"].map((key) => (
                      <option key={key} value={key}>
                        {key} - {TDS_SECTIONS[key]?.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Nationality *</label>
                  <input
                    type="text"
                    value={form.nationality}
                    onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    placeholder="e.g. American"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Tax Treaty Country</label>
                  <input
                    type="text"
                    value={form.taxTreatyCountry}
                    onChange={(e) => setForm((p) => ({ ...p, taxTreatyCountry: e.target.value }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    placeholder="e.g. USA"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Article Number</label>
                  <input
                    type="text"
                    value={form.articleNumber}
                    onChange={(e) => setForm((p) => ({ ...p, articleNumber: e.target.value }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    placeholder="e.g. Article 7"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as NonResidentEntry["status"] }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="pending">Pending</option>
                    <option value="filed">Filed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Base Amount (₹) *</label>
                  <input
                    type="number"
                    value={form.baseAmount || ""}
                    onChange={(e) => setForm((p) => ({ ...p, baseAmount: Number(e.target.value) }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    min={0}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">TDS Rate (%)</label>
                  <input
                    type="number"
                    value={form.tdsRate}
                    onChange={(e) => setForm((p) => ({ ...p, tdsRate: Number(e.target.value) }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    min={0}
                    max={100}
                    step={0.5}
                  />
                </div>
              </div>

              {form.baseAmount > 0 && (
                <div className="bg-zinc-800/30 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Calculated TDS:</span>
                  <span className="text-lg font-bold text-cyan-400">
                    {formatCurrency(calculateTDS(form.baseAmount, form.tdsRate))}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!form.name.trim()) {
                    toast.error("Please enter deductee name");
                    return;
                  }
                  if (!isValidPAN(form.pan)) {
                    toast.error("Please enter a valid PAN");
                    return;
                  }
                  if (form.baseAmount <= 0) {
                    toast.error("Please enter a valid base amount");
                    return;
                  }
                  if (!form.nationality.trim()) {
                    toast.error("Please enter nationality");
                    return;
                  }
                  onSave(form);
                }}
                className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Save size={16} />
                {entry ? "Update" : "Save"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TCSFormModal({
  show,
  entry,
  onSave,
  onClose,
}: {
  show: boolean;
  entry: TCSEntry | null;
  onSave: (entry: Omit<TCSEntry, "id" | "tcsAmount" | "certificateGenerated">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    collecteeName: entry?.collecteeName ?? "",
    pan: entry?.pan ?? "",
    section: entry?.section ?? "206C_1H",
    paymentDate: entry?.paymentDate ?? format(new Date(), "yyyy-MM-dd"),
    baseAmount: entry?.baseAmount ?? 0,
    tcsRate: entry?.tcsRate ?? TCS_SECTIONS["206C_1H"].rate,
    status: entry?.status ?? "pending" as const,
  });

  const handleSectionChange = (section: string) => {
    const sectionData = TCS_SECTIONS[section];
    setForm((p) => ({ ...p, section, tcsRate: sectionData?.rate ?? 0 }));
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">
                {entry ? "Edit TCS Entry" : "Add TCS Entry"}
              </h3>
              <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Collectee Name *</label>
                <input
                  type="text"
                  value={form.collecteeName}
                  onChange={(e) => setForm((p) => ({ ...p, collecteeName: e.target.value }))}
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="Enter collectee name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">PAN *</label>
                  <input
                    type="text"
                    value={form.pan}
                    onChange={(e) => setForm((p) => ({ ...p, pan: e.target.value.toUpperCase() }))}
                    className={`w-full bg-zinc-800/50 border rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none ${
                      form.pan && !isValidPAN(form.pan) ? "border-red-500 focus:border-red-500" : "border-zinc-700 focus:border-cyan-500"
                    }`}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                  {form.pan && !isValidPAN(form.pan) && (
                    <p className="text-xs text-red-400 mt-1">Invalid PAN format</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Section *</label>
                  <select
                    value={form.section}
                    onChange={(e) => handleSectionChange(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {Object.entries(TCS_SECTIONS).map(([key, val]) => (
                      <option key={key} value={key}>
                        {key} - {val.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as TCSEntry["status"] }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="pending">Pending</option>
                    <option value="filed">Filed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Base Amount (₹) *</label>
                  <input
                    type="number"
                    value={form.baseAmount || ""}
                    onChange={(e) => setForm((p) => ({ ...p, baseAmount: Number(e.target.value) }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    min={0}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">TCS Rate (%)</label>
                  <input
                    type="number"
                    value={form.tcsRate}
                    onChange={(e) => setForm((p) => ({ ...p, tcsRate: Number(e.target.value) }))}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    min={0}
                    max={100}
                    step={0.1}
                  />
                </div>
              </div>

              {form.baseAmount > 0 && (
                <div className="bg-zinc-800/30 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Calculated TCS:</span>
                  <span className="text-lg font-bold text-cyan-400">
                    {formatCurrency(calculateTDS(form.baseAmount, form.tcsRate))}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!form.collecteeName.trim()) {
                    toast.error("Please enter collectee name");
                    return;
                  }
                  if (!isValidPAN(form.pan)) {
                    toast.error("Please enter a valid PAN");
                    return;
                  }
                  if (form.baseAmount <= 0) {
                    toast.error("Please enter a valid base amount");
                    return;
                  }
                  onSave(form);
                }}
                className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Save size={16} />
                {entry ? "Update" : "Save"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
