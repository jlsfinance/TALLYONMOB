
import React, { useState, useMemo, useCallback, memo } from 'react';
import { Invoice } from '../types';
import { StorageService } from '../services/storageService';
import { Search, MoreVertical, FileText, Trash2, Users, Edit, Eye, ChevronRight, Plus, ChevronDown, Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HapticService } from '../services/hapticService';
import { useCompany } from '../contexts/CompanyContext';
import { InvoicePdfService } from '../services/invoicePdfService';
import { useSearch } from '../contexts/SearchContext';
import { useScrollDirection } from '../hooks/useScrollDirection';
import { isLowEndDevice, debounce } from '../utils/performance';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { formatDate } from '../utils/dateUtils';

// Check device capability once
const IS_LOW_END = isLowEndDevice();
const PAGE_SIZE = IS_LOW_END ? 15 : 30; // Smaller batches for low-end

interface AllInvoicesProps {
  invoices?: Invoice[];
  title?: string;
  createLabel?: string;
  onView?: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoice: Invoice) => void;
  onViewLedger?: (customerId: string) => void;
  onCreate?: () => void;
}

// Memoized Invoice Card for better performance
const InvoiceCard = memo(({
  invoice,
  onView,
  onDelete,
  onMenuOpen,
  isLowEnd
}: {
  invoice: Invoice;
  onView?: (inv: Invoice) => void;
  onDelete: (inv: Invoice) => void;
  onMenuOpen: (inv: Invoice) => void;
  isLowEnd: boolean;
}) => {
  const handleClick = useCallback(() => onView?.(invoice), [invoice, onView]);
  const handleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    HapticService.light();
    onMenuOpen(invoice);
  }, [invoice, onMenuOpen]);

  // Simplified card for low-end (no drag, minimal animations)
  if (isLowEnd) {
    return (
      <div
        className="bg-surface-container-low p-4 flex justify-between items-center rounded-2xl border border-border cursor-pointer"
        onClick={handleClick}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-sm truncate max-w-[140px]">{invoice.customerName}</h3>
            <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
              <span>#{invoice.invoiceNumber}</span>
              {invoice.type === 'CREDIT_NOTE' && <span className="text-orange-600 font-bold bg-orange-100 px-1 rounded-sm">CN</span>}
              <span>• {formatDate(invoice.date)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">₹{invoice.total.toLocaleString('en-IN')}</p>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${(invoice.type === 'CREDIT_NOTE' || invoice.invoiceNumber.startsWith('CN-'))
              ? 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800'
              : invoice.status === 'PAID'
                ? 'bg-google-green/10 text-google-green'
                : 'bg-google-yellow/10 text-google-yellow'
              }`}>
              {(invoice.type === 'CREDIT_NOTE' || invoice.invoiceNumber.startsWith('CN-')) ? 'CREDIT NOTE' : invoice.status}
            </span>
          </div>
          <button onClick={handleMenu} className="p-1.5 text-muted-foreground">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Full card with animations for capable devices
  return (
    <div className="relative overflow-hidden rounded-[28px] group bg-surface-container-low border border-border shadow-sm">
      <div className="absolute inset-0 bg-google-red flex justify-end items-center px-8">
        <Trash2 className="w-6 h-6 text-white" />
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.6}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80) {
            HapticService.medium();
            onDelete(invoice);
          }
        }}
        whileTap={{ scale: 0.99 }}
        className="bg-surface-container-low p-5 flex justify-between items-center relative z-10 cursor-pointer"
        onClick={handleClick}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-sm tracking-tight truncate max-w-[180px]">{invoice.customerName}</h3>
            <p className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5 mt-0.5">
              #{invoice.invoiceNumber}
              {invoice.type === 'CREDIT_NOTE' && <span className="text-[9px] text-orange-600 font-bold bg-orange-100 dark:bg-orange-900/40 px-1.5 py-0.5 rounded-md">CN</span>}
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              {formatDate(invoice.date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-base font-bold text-foreground">₹{invoice.total.toLocaleString('en-IN')}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${(invoice.type === 'CREDIT_NOTE' || invoice.invoiceNumber.startsWith('CN-'))
              ? 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800'
              : invoice.status === 'PAID'
                ? 'bg-google-green/10 text-google-green'
                : 'bg-google-yellow/10 text-google-yellow'
              }`}>
              {(invoice.type === 'CREDIT_NOTE' || invoice.invoiceNumber.startsWith('CN-')) ? 'CREDIT NOTE' : invoice.status}
            </span>
          </div>
          <button className="p-2 rounded-full hover:bg-surface-container-highest transition-colors text-muted-foreground" onClick={handleMenu}>
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
});

InvoiceCard.displayName = 'InvoiceCard';

const AllInvoices: React.FC<AllInvoicesProps> = ({
  invoices: propInvoices,
  title = 'Invoices',
  createLabel = 'Add Invoice',
  onView,
  onEdit,
  onDelete,
  onViewLedger,
  onCreate
}) => {
  const invoices = propInvoices || StorageService.getInvoices();

  // Filter out credit notes from Sales view (they belong in customer ledger only)
  const filteredSalesInvoices = title === 'Sales'
    ? invoices.filter(inv => inv.type !== 'CREDIT_NOTE')
    : invoices;

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');
  const [selectedForAction, setSelectedForAction] = useState<Invoice | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { company } = useCompany();
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const { setSearchVisible, clearSearch } = useSearch();
  const scrollDirection = useScrollDirection({ threshold: 15 });

  // Debounced search handler
  const handleSearchChange = useMemo(
    () => debounce((value: string) => setDebouncedSearch(value), 300),
    []
  );

  const onSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    handleSearchChange(value);
  }, [handleSearchChange]);

  // Memoized filtered list
  const filteredInvoices = useMemo(() => {
    return filteredSalesInvoices.filter(inv => {
      const matchesSearch =
        inv.customerName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        inv.invoiceNumber.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredSalesInvoices, debouncedSearch, statusFilter]);

  // Visible items (paginated)
  const visibleInvoices = useMemo(
    () => filteredInvoices.slice(0, visibleCount),
    [filteredInvoices, visibleCount]
  );

  const hasMore = visibleCount < filteredInvoices.length;

  const loadMore = useCallback(() => {
    setVisibleCount(prev => prev + PAGE_SIZE);
  }, []);

  const handleDelete = useCallback((inv: Invoice) => {
    setInvoiceToDelete(inv);
  }, []);

  const confirmDelete = async () => {
    if (invoiceToDelete) {
      if (onDelete) onDelete(invoiceToDelete);
      else {
        StorageService.deleteInvoice(invoiceToDelete.id);
        window.location.reload();
      }
      setInvoiceToDelete(null);
    }
  };

  const handleMenuOpen = useCallback((inv: Invoice) => {
    setSelectedForAction(inv);
  }, []);

  return (
    <div className="bg-background min-h-screen flex flex-col pb-32">
      {/* Ultra-Compact Header */}
      <div className="sticky top-0 z-30 px-4 pt-safe pb-2 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-xl font-black font-heading text-foreground tracking-tighter uppercase italic shrink-0">{title}</h1>
              <span className="px-2 py-0.5 bg-muted/10 text-muted-foreground text-[8px] font-black rounded-md border border-border/50 uppercase tracking-tighter">
                {filteredInvoices.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {['ALL', 'PAID', 'PENDING'].map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    HapticService.light();
                    setStatusFilter(status as any);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all whitespace-nowrap border ${statusFilter === status
                    ? 'bg-google-blue text-white border-google-blue shadow-sm'
                    : 'bg-surface-container-low text-muted-foreground border-border/60'
                    }`}
                >
                  {status}
                </button>
              ))}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  HapticService.light();
                  setSearchVisible(true);
                }}
                className="p-1.5 rounded-xl bg-google-blue/10 text-google-blue border border-google-blue/20 shrink-0"
              >
                <Search className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Inline Search (Scroll-Sensitive) */}
          <AnimatePresence>
            {(scrollDirection === 'down' || searchTerm) && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: 'auto', opacity: 1, marginTop: 4 }}
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                transition={{ duration: 0.2 }}
                className="relative mb-1 overflow-hidden"
              >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <input
                  type="text"
                  placeholder="Quick search..."
                  className="w-full bg-surface-container-low/50 border border-border/40 rounded-xl pl-9 pr-3 py-2 outline-none text-xs font-bold text-foreground placeholder:text-muted-foreground/40 focus:border-google-blue/50 transition-all"
                  value={searchTerm}
                  onChange={onSearchInput}
                />
                {searchTerm && (
                  <button
                    onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  >
                    <X className="w-3 h-3 text-muted-foreground/40" />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-4 mt-4 space-y-3">
        {/* Use optimized card rendering */}
        {visibleInvoices.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            onView={(inv) => {
              clearSearch(); // Close search bar when viewing a bill
              onView?.(inv);
            }}
            onDelete={handleDelete}
            onMenuOpen={handleMenuOpen}
            isLowEnd={IS_LOW_END}
          />
        ))}

        {/* Load More Button */}
        {hasMore && (
          <button
            onClick={loadMore}
            className="w-full py-4 bg-surface-container-low border border-border rounded-2xl text-sm font-bold text-muted-foreground hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-2"
          >
            <ChevronDown className="w-4 h-4" />
            Load More ({filteredInvoices.length - visibleCount} remaining)
          </button>
        )}

        {/* PREMIUM BOTTOM ACTION SHEET */}
        <AnimatePresence>
          {selectedForAction && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedForAction(null)}
                className="fixed inset-0 bg-black/60 z-[100]"
              />

              {/* Sheet */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "tween", duration: 0.2 }}
                className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 z-[101] rounded-t-[32px] shadow-2xl overflow-hidden pb-8"
              >
                {/* Drag Handle */}
                <div className="flex justify-center py-3">
                  <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>

                {/* Header Info */}
                <div className="px-6 py-4 flex items-center gap-4 border-b border-slate-50 dark:border-slate-800/50">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black font-heading text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                      {selectedForAction.customerName}
                    </h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 opacity-60">
                      Invoice: #{selectedForAction.invoiceNumber}
                    </p>
                  </div>
                </div>

                {/* Action Items */}
                <div className="px-4 py-4 space-y-2">
                  {/* View Details */}
                  <button
                    onClick={() => {
                      clearSearch(); // Close search bar
                      onView && onView(selectedForAction);
                      setSelectedForAction(null);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                      <Eye className="w-6 h-6" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-base">View Details</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">View or print breakdown</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </button>

                  <button
                    onClick={async () => {
                      if (company && selectedForAction) {
                        const customer = StorageService.getCustomers().find(c => c.id === selectedForAction.customerId) || null;
                        await InvoicePdfService.generatePDF(selectedForAction, company as any, customer);
                        setSelectedForAction(null);
                      }
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <Download className="w-6 h-6" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-base">Download PDF</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Save as PDF file</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </button>

                  {/* Ledger */}
                  <button
                    onClick={() => {
                      onViewLedger && onViewLedger(selectedForAction.customerId);
                      setSelectedForAction(null);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-base">Customer Ledger</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Statement & history</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => {
                      onEdit && onEdit(selectedForAction);
                      setSelectedForAction(null);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                      <Edit className="w-6 h-6" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-base">Edit Invoice</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Modify balance or items</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </button>

                  {/* Delete */}
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        handleDelete(selectedForAction);
                        setSelectedForAction(null);
                      }}
                      className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-red-50 dark:hover:bg-red-900/10 transition-all group active:scale-[0.98]"
                    >
                      <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                        <Trash2 className="w-6 h-6" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-bold text-red-600 text-base">Delete Permanently</p>
                        <p className="text-xs text-red-400/80">Remove record forever</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-red-200 group-hover:text-red-400 transition-colors" />
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {filteredInvoices.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border-none">
              <FileText className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-slate-500 font-bold">No results</h3>
            <p className="text-slate-400 text-xs mt-1">Adjust filters or search term</p>
          </div>
        )}
      </div>

      {onCreate && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="fixed bottom-24 right-4 z-40 md:bottom-8 md:right-8"
        >
          <button
            onClick={() => {
              HapticService.medium();
              onCreate();
            }}
            className="h-14 px-5 bg-google-blue text-white rounded-[28px] shadow-lg shadow-google-blue/40 flex items-center gap-3 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus className="w-6 h-6" />
            <span className="font-bold text-sm tracking-tight">{createLabel}</span>
          </button>
        </motion.div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Invoice?"
        message="Are you sure you want to delete this invoice? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default AllInvoices;
