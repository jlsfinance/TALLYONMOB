import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  ArrowRightLeft,
  Download,
  Filter,
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  Warehouse,
  Clock,
  Target,
  DollarSign,
  Hash,
  ShoppingCart,
  MinusCircle,
  PlusCircle,
  Activity,
  GitBranch,
  Scale,
  RefreshCw,
  Eye,
  ChevronUp,
} from "lucide-react";
import { format, subDays } from "date-fns";
import toast from "react-hot-toast";

const today = new Date();

const generateDate = (daysAgo: number) => subDays(today, daysAgo);

interface PurchaseBatch {
  id: string;
  date: Date;
  invoiceNo: string;
  quantity: number;
  rate: number;
  remainingQty: number;
  groupId: string;
  godown: string;
}

interface SaleAllocation {
  id: string;
  date: Date;
  invoiceNo: string;
  quantity: number;
  rate: number;
  batchUsed: string;
  cost: number;
}

interface StockMovement {
  id: string;
  date: Date;
  type: "Purchase" | "Sale";
  quantity: number;
  rate: number;
  runningQty: number;
  avgCost: number;
  value: number;
}

interface StockLedgerItem {
  id: string;
  date: Date;
  description: string;
  inward: number;
  outward: number;
  balance: number;
  rate: number;
  value: number;
}

interface StockGroup {
  name: string;
  value: number;
  items: number;
  avgAge: number;
}

interface GodownStock {
  name: string;
  value: number;
  items: number;
  capacity: number;
}

interface AgingBucket {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

const ITEMS = [
  { id: "1", name: "Rice Basmati Premium (25kg)", reorderLevel: 50 },
  { id: "2", name: "Wheat Atta (50kg)", reorderLevel: 100 },
  { id: "3", name: "Sugar ICUMSA 45 (50kg)", reorderLevel: 75 },
  { id: "4", name: "Tur Dal (50kg)", reorderLevel: 40 },
  { id: "5", name: "Refined Oil Soybean (15L)", reorderLevel: 60 },
  { id: "6", name: "Salt Iodized (25kg)", reorderLevel: 30 },
  { id: "7", name: "Onion Fresh (50kg)", reorderLevel: 25 },
  { id: "8", name: "Potato Regular (50kg)", reorderLevel: 25 },
];

const BATCHES: PurchaseBatch[] = [
  { id: "B001", date: generateDate(45), invoiceNo: "PUR-2024-001", quantity: 200, rate: 42, remainingQty: 50, groupId: "1", godown: "Main Warehouse" },
  { id: "B002", date: generateDate(30), invoiceNo: "PUR-2024-015", quantity: 150, rate: 44, remainingQty: 150, groupId: "1", godown: "Main Warehouse" },
  { id: "B003", date: generateDate(15), invoiceNo: "PUR-2024-028", quantity: 300, rate: 43, remainingQty: 300, groupId: "1", godown: "Godown A" },
  { id: "B004", date: generateDate(40), invoiceNo: "PUR-2024-005", quantity: 500, rate: 28, remainingQty: 120, groupId: "2", godown: "Main Warehouse" },
  { id: "B005", date: generateDate(20), invoiceNo: "PUR-2024-019", quantity: 400, rate: 30, remainingQty: 400, groupId: "2", godown: "Godown B" },
  { id: "B006", date: generateDate(35), invoiceNo: "PUR-2024-008", quantity: 250, rate: 36, remainingQty: 80, groupId: "3", godown: "Main Warehouse" },
  { id: "B007", date: generateDate(10), invoiceNo: "PUR-2024-032", quantity: 350, rate: 38, remainingQty: 350, groupId: "3", godown: "Godown A" },
  { id: "B008", date: generateDate(50), invoiceNo: "PUR-2024-002", quantity: 100, rate: 120, remainingQty: 15, groupId: "4", godown: "Main Warehouse" },
  { id: "B009", date: generateDate(25), invoiceNo: "PUR-2024-022", quantity: 200, rate: 115, remainingQty: 200, groupId: "4", godown: "Godown A" },
  { id: "B010", date: generateDate(12), invoiceNo: "PUR-2024-030", quantity: 180, rate: 185, remainingQty: 180, groupId: "5", godown: "Godown B" },
  { id: "B011", date: generateDate(5), invoiceNo: "PUR-2024-035", quantity: 400, rate: 22, remainingQty: 200, groupId: "6", godown: "Main Warehouse" },
  { id: "B012", date: generateDate(8), invoiceNo: "PUR-2024-033", quantity: 150, rate: 18, remainingQty: 10, groupId: "7", godown: "Godown A" },
  { id: "B013", date: generateDate(3), invoiceNo: "PUR-2024-037", quantity: 180, rate: 15, remainingQty: 15, groupId: "8", godown: "Godown B" },
];

const SALE_ALLOCATIONS: SaleAllocation[] = [
  { id: "S001", date: generateDate(40), invoiceNo: "SAL-2024-001", quantity: 150, rate: 52, batchUsed: "B001", cost: 42 },
  { id: "S002", date: generateDate(25), invoiceNo: "SAL-2024-010", quantity: 200, rate: 54, batchUsed: "B001", cost: 42 },
  { id: "S003", date: generateDate(10), invoiceNo: "SAL-2024-025", quantity: 100, rate: 53, batchUsed: "B002", cost: 44 },
  { id: "S004", date: generateDate(35), invoiceNo: "SAL-2024-003", quantity: 380, rate: 35, batchUsed: "B004", cost: 28 },
  { id: "S005", date: generateDate(18), invoiceNo: "SAL-2024-012", quantity: 250, rate: 37, batchUsed: "B004", cost: 28 },
  { id: "S006", date: generateDate(28), invoiceNo: "SAL-2024-008", quantity: 170, rate: 45, batchUsed: "B006", cost: 36 },
  { id: "S007", date: generateDate(5), invoiceNo: "SAL-2024-030", quantity: 85, rate: 46, batchUsed: "B006", cost: 36 },
  { id: "S008", date: generateDate(45), invoiceNo: "SAL-2024-002", quantity: 85, rate: 150, batchUsed: "B008", cost: 120 },
  { id: "S009", date: generateDate(15), invoiceNo: "SAL-2024-018", quantity: 300, rate: 28, batchUsed: "B011", cost: 22 },
  { id: "S010", date: generateDate(7), invoiceNo: "SAL-2024-028", quantity: 140, rate: 25, batchUsed: "B012", cost: 18 },
];

const generateStockMovements = (): StockMovement[] => {
  const movements: StockMovement[] = [];
  let runningQty = 0;
  let totalCost = 0;

  const events = [
    { date: generateDate(45), type: "Purchase" as const, qty: 200, rate: 42 },
    { date: generateDate(40), type: "Sale" as const, qty: 150, rate: 52 },
    { date: generateDate(30), type: "Purchase" as const, qty: 150, rate: 44 },
    { date: generateDate(25), type: "Sale" as const, qty: 200, rate: 54 },
    { date: generateDate(15), type: "Purchase" as const, qty: 300, rate: 43 },
    { date: generateDate(10), type: "Sale" as const, qty: 100, rate: 53 },
  ];

  events.forEach((ev, i) => {
    if (ev.type === "Purchase") {
      runningQty += ev.qty;
      totalCost += ev.qty * ev.rate;
    } else {
      const avgCostBefore = runningQty > 0 ? totalCost / runningQty : 0;
      totalCost -= ev.qty * avgCostBefore;
      runningQty -= ev.qty;
    }
    const avgCost = runningQty > 0 ? totalCost / runningQty : 0;
    movements.push({
      id: `M${i + 1}`,
      date: ev.date,
      type: ev.type,
      quantity: ev.qty,
      rate: ev.rate,
      runningQty,
      avgCost: Math.round(avgCost * 100) / 100,
      value: Math.round(runningQty * avgCost * 100) / 100,
    });
  });
  return movements;
};

const LEDGER_DATA: Record<string, StockLedgerItem[]> = {
  "1": [
    { id: "L1", date: generateDate(45), description: "Opening Balance + Purchase PUR-001", inward: 200, outward: 0, balance: 200, rate: 42, value: 8400 },
    { id: "L2", date: generateDate(40), description: "Sale SAL-001", inward: 0, outward: 150, balance: 50, rate: 42, value: 2100 },
    { id: "L3", date: generateDate(30), description: "Purchase PUR-015", inward: 150, outward: 0, balance: 200, rate: 43, value: 8600 },
    { id: "L4", date: generateDate(25), description: "Sale SAL-010", inward: 0, outward: 200, balance: 0, rate: 43, value: 0 },
    { id: "L5", date: generateDate(15), description: "Purchase PUR-028", inward: 300, outward: 0, balance: 300, rate: 43, value: 12900 },
    { id: "L6", date: generateDate(10), description: "Sale SAL-025", inward: 0, outward: 100, balance: 200, rate: 43, value: 8600 },
  ],
  "2": [
    { id: "L7", date: generateDate(40), description: "Purchase PUR-005", inward: 500, outward: 0, balance: 500, rate: 28, value: 14000 },
    { id: "L8", date: generateDate(35), description: "Sale SAL-003", inward: 0, outward: 380, balance: 120, rate: 28, value: 3360 },
    { id: "L9", date: generateDate(20), description: "Purchase PUR-019", inward: 400, outward: 0, balance: 520, rate: 29, value: 15080 },
    { id: "L10", date: generateDate(18), description: "Sale SAL-012", inward: 0, outward: 250, balance: 270, rate: 29, value: 7830 },
  ],
};

const STOCK_GROUPS: StockGroup[] = [
  { name: "Grains & Cereals", value: 42800, items: 2, avgAge: 30 },
  { name: "Sweeteners", value: 19300, items: 1, avgAge: 22 },
  { name: "Pulses & Lentils", value: 28500, items: 1, avgAge: 37 },
  { name: "Edible Oils", value: 33300, items: 1, avgAge: 12 },
  { name: "Seasonings", value: 8800, items: 1, avgAge: 5 },
  { name: "Fresh Produce", value: 3300, items: 2, avgAge: 7 },
];

const GODOWNS: GodownStock[] = [
  { name: "Main Warehouse", value: 58200, items: 5, capacity: 80 },
  { name: "Godown A", value: 49700, items: 4, capacity: 65 },
  { name: "Godown B", value: 28100, items: 3, capacity: 45 },
];

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(n: number) {
  return n.toLocaleString("en-IN");
}

export default function InventoryValuationPage() {
  const [selectedItem, setSelectedItem] = useState(ITEMS[0].id);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "fifo" | "average" | "ledger" | "report" | "compare">("summary");

  const stockMovements = useMemo(() => generateStockMovements(), []);

  const summary = useMemo(() => {
    const totalValue = BATCHES.reduce((s, b) => s + b.remainingQty * b.rate, 0);
    const totalItems = ITEMS.length;
    const totalQty = BATCHES.reduce((s, b) => s + b.remainingQty, 0);
    const avgCost = totalQty > 0 ? totalValue / totalQty : 0;
    const lowStock = ITEMS.filter((it) => {
      const qty = BATCHES.filter((b) => b.groupId === it.id).reduce((s, b) => s + b.remainingQty, 0);
      return qty < it.reorderLevel;
    });
    const fastMoving = ITEMS.filter((it) => {
      const sold = SALE_ALLOCATIONS.filter((sa) => {
        const batch = BATCHES.find((b) => b.id === sa.batchUsed);
        return batch?.groupId === it.id;
      }).reduce((s, sa) => s + sa.quantity, 0);
      return sold > 200;
    });
    return { totalValue, totalItems, totalQty, avgCost, lowStock, fastMoving };
  }, []);

  const fifoValue = useMemo(() => {
    return BATCHES.reduce((s, b) => s + b.remainingQty * b.rate, 0);
  }, []);

  const averageValue = useMemo(() => {
    const totalQty = BATCHES.reduce((s, b) => s + b.remainingQty, 0);
    const totalCost = BATCHES.reduce((s, b) => s + b.remainingQty * b.rate, 0);
    return totalQty > 0 ? totalCost : 0;
  }, []);

  const lifoValue = useMemo(() => {
    const sorted = [...BATCHES].sort((a, b) => b.date.getTime() - a.date.getTime());
    return sorted.reduce((s, b) => s + b.remainingQty * b.rate, 0);
  }, []);

  const agingBuckets: AgingBucket[] = useMemo(() => {
    const totalValue = BATCHES.reduce((s, b) => s + b.remainingQty * b.rate, 0);
    const buckets = [
      { label: "0-30 Days", days: 30, color: "#22D3EE" },
      { label: "30-60 Days", days: 60, color: "#FBBF24" },
      { label: "60-90 Days", days: 90, color: "#F97316" },
      { label: "90+ Days", days: Infinity, color: "#EF4444" },
    ];
    return buckets.map((bucket, i) => {
      const prevDays = i === 0 ? 0 : buckets[i - 1].days;
      const value = BATCHES.filter((b) => {
        const age = Math.floor((today.getTime() - b.date.getTime()) / (1000 * 60 * 60 * 24));
        return age >= prevDays && age < bucket.days;
      }).reduce((s, b) => s + b.remainingQty * b.rate, 0);
      return { label: bucket.label, value, percentage: totalValue > 0 ? (value / totalValue) * 100 : 0, color: bucket.color };
    });
  }, []);

  const tabs = [
    { key: "summary", label: "Summary", icon: BarChart3 },
    { key: "fifo", label: "FIFO", icon: ArrowRightLeft },
    { key: "average", label: "Avg Cost", icon: Scale },
    { key: "ledger", label: "Ledger", icon: Activity },
    { key: "report", label: "Report", icon: FileIcon },
    { key: "compare", label: "Compare", icon: GitBranch },
  ] as const;

  const handleExport = () => {
    toast.success("Inventory valuation report exported successfully!");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 lg:p-8">
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-50 flex items-center gap-3">
              <Package className="w-8 h-8 text-cyan-400" />
              Inventory Valuation
            </h1>
            <p className="text-zinc-400 mt-1 text-sm">As of {format(today, "dd MMMM yyyy")}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm transition-colors">
              <Download className="w-4 h-4" />
              Export
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg text-sm transition-colors">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </motion.div>

        {/* Tab Navigation */}
        <motion.div variants={fadeInUp} className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-zinc-700">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.key
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                    : "bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </motion.div>

        {/* Summary Cards */}
        {(activeTab === "summary" || true) && (
          <motion.div variants={fadeInUp} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total Inventory Value", value: formatCurrency(summary.totalValue), icon: DollarSign, color: "cyan" },
              { label: "Total Items Tracked", value: formatNumber(summary.totalItems), icon: Hash, color: "emerald" },
              { label: "Total Quantity in Stock", value: formatNumber(summary.totalQty), icon: Package, color: "blue" },
              { label: "Avg Cost Per Unit", value: formatCurrency(summary.avgCost), icon: Target, color: "violet" },
              { label: "Low Stock Items", value: `${summary.lowStock.length} items`, icon: AlertTriangle, color: "amber", sub: summary.lowStock.map((i) => i.name.split(" ")[0]).join(", ") },
              { label: "Fast Moving Items", value: `${summary.fastMoving.length} items`, icon: TrendingUp, color: "rose", sub: summary.fastMoving.map((i) => i.name.split(" ")[0]).join(", ") },
            ].map((card, i) => {
              const Icon = card.icon;
              const colorMap: Record<string, string> = {
                cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
                emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
                amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
              };
              return (
                <motion.div key={i} variants={fadeInUp} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded-md border ${colorMap[card.color]}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs text-zinc-500">{card.label}</span>
                  </div>
                  <p className="text-lg font-bold text-zinc-50">{card.value}</p>
                  {card.sub && <p className="text-xs text-zinc-500 mt-1 truncate">{card.sub}</p>}
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* FIFO Tab */}
        {activeTab === "fifo" && (
          <motion.div variants={fadeInUp} className="space-y-6">
            {/* Batch Flow Diagram */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
                FIFO Batch Flow
              </h3>
              <div className="space-y-3">
                {BATCHES.filter((b) => b.remainingQty < b.quantity)
                  .slice(0, 5)
                  .map((batch) => {
                    const consumed = batch.quantity - batch.remainingQty;
                    const consumedPct = (consumed / batch.quantity) * 100;
                    const remainingPct = (batch.remainingQty / batch.quantity) * 100;
                    return (
                      <div key={batch.id} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-zinc-400 shrink-0">{format(batch.date, "dd MMM")}</div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-zinc-300">{batch.invoiceNo}</span>
                            <span className="text-xs text-zinc-500">
                              {consumed} consumed / {batch.remainingQty} remaining
                            </span>
                          </div>
                          <div className="h-6 bg-zinc-800 rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 flex items-center justify-center text-[10px] font-medium text-zinc-900 transition-all duration-500"
                              style={{ width: `${consumedPct}%` }}
                            >
                              {consumedPct > 15 && "Used"}
                            </div>
                            <div
                              className="h-full bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-300 transition-all duration-500"
                              style={{ width: `${remainingPct}%` }}
                            >
                              {remainingPct > 15 && "Stock"}
                            </div>
                          </div>
                        </div>
                        <div className="w-24 text-right text-xs text-zinc-400 shrink-0">{formatCurrency(batch.rate)}/unit</div>
                      </div>
                    );
                  })}
              </div>
              <div className="flex items-center gap-6 mt-4 text-xs text-zinc-500">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-cyan-500" />
                  Consumed (Oldest First)
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-zinc-700" />
                  Remaining in Stock
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Purchase Batches */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <PlusCircle className="w-4 h-4 text-emerald-400" />
                    Purchase Batches
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Date</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Invoice</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Qty</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Rate</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Total</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Rem. Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BATCHES.map((b) => (
                        <tr key={b.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="px-3 py-2 text-zinc-300">{format(b.date, "dd/MM/yy")}</td>
                          <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{b.invoiceNo}</td>
                          <td className="px-3 py-2 text-right text-zinc-300">{formatNumber(b.quantity)}</td>
                          <td className="px-3 py-2 text-right text-zinc-300">{formatCurrency(b.rate)}</td>
                          <td className="px-3 py-2 text-right text-zinc-100 font-medium">{formatCurrency(b.quantity * b.rate)}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`${b.remainingQty < b.quantity / 2 ? "text-amber-400" : "text-emerald-400"} font-medium`}>
                              {formatNumber(b.remainingQty)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sale Allocations */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <MinusCircle className="w-4 h-4 text-rose-400" />
                    Sale Allocations (FIFO)
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Date</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Invoice</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Qty</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Rate</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Batch</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SALE_ALLOCATIONS.map((sa) => (
                        <tr key={sa.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="px-3 py-2 text-zinc-300">{format(sa.date, "dd/MM/yy")}</td>
                          <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{sa.invoiceNo}</td>
                          <td className="px-3 py-2 text-right text-zinc-300">{formatNumber(sa.quantity)}</td>
                          <td className="px-3 py-2 text-right text-zinc-300">{formatCurrency(sa.rate)}</td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded-full border border-cyan-500/20">
                              {sa.batchUsed}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-100 font-medium">{formatCurrency(sa.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Average Cost Tab */}
        {activeTab === "average" && (
          <motion.div variants={fadeInUp} className="space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-violet-400" />
                  Weighted Average Cost — Stock Movements
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Date</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Type</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Quantity</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Rate</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Running Qty</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Avg Cost</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockMovements.map((m) => (
                      <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-zinc-300">{format(m.date, "dd/MM/yy")}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full border ${
                              m.type === "Purchase"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            }`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-300">{formatNumber(m.quantity)}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">{formatCurrency(m.rate)}</td>
                        <td className="px-3 py-2 text-right text-zinc-300 font-medium">{formatNumber(m.runningQty)}</td>
                        <td className="px-3 py-2 text-right text-cyan-400 font-medium">{formatCurrency(m.avgCost)}</td>
                        <td className="px-3 py-2 text-right text-zinc-100 font-medium">{formatCurrency(m.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FIFO vs Average Comparison */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
                FIFO vs Average Cost — Comparison
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                  <p className="text-xs text-zinc-500 mb-1">FIFO Value</p>
                  <p className="text-xl font-bold text-cyan-400">{formatCurrency(fifoValue)}</p>
                </div>
                <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                  <p className="text-xs text-zinc-500 mb-1">Average Cost Value</p>
                  <p className="text-xl font-bold text-violet-400">{formatCurrency(summary.totalValue)}</p>
                </div>
                <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                  <p className="text-xs text-zinc-500 mb-1">Difference</p>
                  <p className={`text-xl font-bold ${fifoValue - summary.totalValue >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatCurrency(Math.abs(fifoValue - summary.totalValue))}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {((Math.abs(fifoValue - summary.totalValue) / summary.totalValue) * 100).toFixed(2)}% variance
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Ledger Tab */}
        {activeTab === "ledger" && (
          <motion.div variants={fadeInUp} className="space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 mb-1 block">Select Item</label>
                  <div className="relative">
                    <select
                      value={selectedItem}
                      onChange={(e) => setSelectedItem(e.target.value)}
                      className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 pr-10 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                    >
                      {ITEMS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  </div>
                </div>
                <div className="flex items-end">
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm">
                    <span className="text-zinc-500">Reorder Level: </span>
                    <span className="text-amber-400 font-medium">{ITEMS.find((i) => i.id === selectedItem)?.reorderLevel} units</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Stock Ledger — {ITEMS.find((i) => i.id === selectedItem)?.name}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Date</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Description</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Inward</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Outward</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Balance</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Rate</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(LEDGER_DATA[selectedItem] || []).map((item) => {
                      const reorderLvl = ITEMS.find((i) => i.id === selectedItem)?.reorderLevel || 0;
                      const isLow = item.balance < reorderLvl;
                      return (
                        <tr key={item.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isLow ? "bg-amber-500/5" : ""}`}>
                          <td className="px-3 py-2 text-zinc-300">{format(item.date, "dd/MM/yy")}</td>
                          <td className="px-3 py-2 text-zinc-300 max-w-[200px] truncate">{item.description}</td>
                          <td className="px-3 py-2 text-right text-emerald-400">{item.inward > 0 ? `+${formatNumber(item.inward)}` : "-"}</td>
                          <td className="px-3 py-2 text-right text-rose-400">{item.outward > 0 ? `-${formatNumber(item.outward)}` : "-"}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`font-medium ${isLow ? "text-amber-400" : "text-zinc-100"}`}>
                              {formatNumber(item.balance)}
                            </span>
                            {isLow && (
                              <span className="ml-1.5 inline-flex items-center text-amber-400">
                                <AlertTriangle className="w-3 h-3" />
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-300">{formatCurrency(item.rate)}</td>
                          <td className="px-3 py-2 text-right text-zinc-100 font-medium">{formatCurrency(item.value)}</td>
                        </tr>
                      );
                    })}
                    {(!LEDGER_DATA[selectedItem] || LEDGER_DATA[selectedItem].length === 0) && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                          No ledger entries found for this item.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* Report Tab */}
        {activeTab === "report" && (
          <motion.div variants={fadeInUp} className="space-y-6">
            {/* By Stock Group */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Valuation by Stock Group
                </h3>
              </div>
              <div className="p-4 space-y-2">
                {STOCK_GROUPS.map((group) => (
                  <div
                    key={group.name}
                    className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedGroup(expandedGroup === group.name ? null : group.name)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expandedGroup === group.name ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                        <span className="text-sm text-zinc-100 font-medium">{group.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-zinc-500">{group.items} items</span>
                        <span className="text-sm font-semibold text-zinc-100">{formatCurrency(group.value)}</span>
                      </div>
                    </button>
                    {expandedGroup === group.name && (
                      <div className="px-4 pb-3 border-t border-zinc-700/30 pt-2">
                        <div className="grid grid-cols-3 gap-4 text-xs">
                          <div>
                            <span className="text-zinc-500">Total Value</span>
                            <p className="text-zinc-200 font-medium mt-0.5">{formatCurrency(group.value)}</p>
                          </div>
                          <div>
                            <span className="text-zinc-500">Avg Age</span>
                            <p className="text-zinc-200 font-medium mt-0.5">{group.avgAge} days</p>
                          </div>
                          <div>
                            <span className="text-zinc-500">% of Total</span>
                            <p className="text-zinc-200 font-medium mt-0.5">
                              {((group.value / summary.totalValue) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
                            style={{ width: `${(group.value / summary.totalValue) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* By Godown */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Warehouse className="w-4 h-4 text-emerald-400" />
                  Valuation by Godown / Warehouse
                </h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {GODOWNS.map((g) => (
                  <div key={g.name} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-zinc-100">{g.name}</span>
                      <span className="text-xs text-zinc-500">{g.items} items</span>
                    </div>
                    <p className="text-lg font-bold text-cyan-400 mb-2">{formatCurrency(g.value)}</p>
                    <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                      <span>Capacity Used</span>
                      <span>{g.capacity}%</span>
                    </div>
                    <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${g.capacity > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${g.capacity}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Aging Analysis */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Stock Aging Analysis
                </h3>
              </div>
              <div className="p-4">
                <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                  {agingBuckets.map((bucket) => (
                    <div
                      key={bucket.label}
                      className="h-full flex items-center justify-center text-[10px] font-medium text-zinc-900 transition-all duration-500"
                      style={{ width: `${bucket.percentage}%`, backgroundColor: bucket.color }}
                    >
                      {bucket.percentage > 8 && `${bucket.percentage.toFixed(1)}%`}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {agingBuckets.map((bucket) => (
                    <div key={bucket.label} className="flex items-center gap-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: bucket.color }} />
                      <div>
                        <p className="text-xs text-zinc-500">{bucket.label}</p>
                        <p className="text-sm font-semibold text-zinc-100">{formatCurrency(bucket.value)}</p>
                        <p className="text-xs text-zinc-500">{bucket.percentage.toFixed(1)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Slow / Dead Stock */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                  Slow Moving / Dead Stock
                </h3>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {[
                    { name: "Salt Iodized (25kg)", lastSale: "2 days ago", qty: 200, status: "Active" },
                    { name: "Onion Fresh (50kg)", lastSale: "7 days ago", qty: 10, status: "Active" },
                    { name: "Potato Regular (50kg)", lastSale: "3 days ago", qty: 15, status: "Low" },
                  ].map((item) => (
                    <div key={item.name} className="flex items-center justify-between bg-zinc-800/30 border border-zinc-700/30 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${item.status === "Low" ? "bg-amber-400" : "bg-emerald-400"}`} />
                        <div>
                          <p className="text-sm text-zinc-100">{item.name}</p>
                          <p className="text-xs text-zinc-500">Last sale: {item.lastSale}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-zinc-100">{formatNumber(item.qty)} units</p>
                        <p className={`text-xs ${item.status === "Low" ? "text-amber-400" : "text-emerald-400"}`}>{item.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Compare Tab */}
        {activeTab === "compare" && (
          <motion.div variants={fadeInUp} className="space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-zinc-100 mb-6 flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-cyan-400" />
                Valuation Methods Comparison
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[
                  { method: "FIFO", value: fifoValue, color: "cyan", desc: "First-In-First-Out — Oldest stock consumed first" },
                  { method: "Average Cost", value: summary.totalValue, color: "violet", desc: "Weighted Average — Smoothed cost over all purchases" },
                  { method: "LIFO", value: lifoValue, color: "amber", desc: "Last-In-First-Out — Newest stock consumed first" },
                ].map((m) => (
                  <div key={m.method} className={`bg-zinc-800/50 border rounded-lg p-5 ${m.color === "cyan" ? "border-cyan-500/30" : m.color === "violet" ? "border-violet-500/30" : "border-amber-500/30"}`}>
                    <p className={`text-xs font-medium mb-1 ${m.color === "cyan" ? "text-cyan-400" : m.color === "violet" ? "text-violet-400" : "text-amber-400"}`}>
                      {m.method}
                    </p>
                    <p className="text-2xl font-bold text-zinc-50">{formatCurrency(m.value)}</p>
                    <p className="text-xs text-zinc-500 mt-2">{m.desc}</p>
                  </div>
                ))}
              </div>

              <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-zinc-100 mb-4">Difference Analysis</h4>
                <div className="space-y-3">
                  {[
                    { label: "FIFO vs Average", diff: fifoValue - summary.totalValue },
                    { label: "FIFO vs LIFO", diff: fifoValue - lifoValue },
                    { label: "Average vs LIFO", diff: summary.totalValue - lifoValue },
                  ].map((d) => (
                    <div key={d.label} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-400">{d.label}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium ${d.diff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {d.diff >= 0 ? "+" : ""}{formatCurrency(d.diff)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          ({((Math.abs(d.diff) / summary.totalValue) * 100).toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recommendation */}
            <div className="bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-zinc-100 mb-3 flex items-center gap-2">
                <Target className="w-5 h-5 text-cyan-400" />
                Recommended Method
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-zinc-400 mb-2">For your business type (Indian Trading / Distribution):</p>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
                    <p className="text-cyan-400 font-semibold mb-1">FIFO — Recommended</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      FIFO is the most commonly used and accepted method in Indian accounting. It provides the most accurate
                      representation of current inventory costs and is compliant with GST requirements. Your FIFO value of{" "}
                      <span className="text-zinc-200 font-medium">{formatCurrency(fifoValue)}</span> best reflects actual stock value.
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-zinc-400 mb-2">Method suitability by business type:</p>
                  <div className="space-y-2">
                    {[
                      { type: "Trading / Distribution", method: "FIFO", reason: "Price inflation management" },
                      { type: "Manufacturing", method: "Average Cost", reason: "Consistent costing" },
                      { type: "Perishable Goods", method: "FIFO", reason: "Natural expiry flow" },
                      { type: "Commodities", method: "LIFO", reason: "Tax optimization (not allowed in India)" },
                    ].map((rec) => (
                      <div key={rec.type} className="flex items-center justify-between bg-zinc-900/40 border border-zinc-800/50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs text-zinc-300 font-medium">{rec.type}</p>
                          <p className="text-[10px] text-zinc-500">{rec.reason}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          rec.method === "FIFO"
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                            : rec.method === "Average Cost"
                            ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                          {rec.method}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
