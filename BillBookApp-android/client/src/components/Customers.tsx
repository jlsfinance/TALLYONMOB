import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WhatsAppNumberModal } from '@/components/WhatsAppNumberModal';
import { InputModal } from '@/components/InputModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { AlertModal } from '@/components/AlertModal';
import { Customer, Invoice, Payment } from '../types';
import { StorageService } from '../services/storageService';
import { WhatsAppService } from '../services/whatsappService';
import { Search, Phone, Mail, MapPin, ArrowLeft, FileText, Download, TrendingUp, Eye, X, Banknote, MessageCircle, Edit, Trash2, Plus, ChevronRight, UserPlus, Share2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import InvoiceView from './InvoiceView';
import { HapticService } from '@/services/hapticService';
import { ContactsService } from '@/services/contactsService';
import { formatDate } from '../utils/dateUtils';

interface CustomersProps {
  onEditInvoice?: (invoice: Invoice) => void;
  onBack?: () => void;
  initialCustomerId?: string;
  initialFilter?: 'receivable' | 'payable' | 'all';
}

interface Transaction {
  id: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
  reference: string; // Invoice # or Payment Ref
  amount: number;
  status?: string; // For invoices
  mode?: string; // For payments or invoice mode
  data: Invoice | Payment;
}

const Customers: React.FC<CustomersProps> = ({ onEditInvoice, onBack, initialCustomerId, initialFilter }) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'RECEIVABLE' | 'PAYABLE'>(
    initialFilter === 'receivable' ? 'RECEIVABLE' :
      initialFilter === 'payable' ? 'PAYABLE' : 'ALL'
  );

  // Sync with prop if it changes
  useEffect(() => {
    if (initialFilter) {
      setActiveFilter(initialFilter === 'receivable' ? 'RECEIVABLE' :
        initialFilter === 'payable' ? 'PAYABLE' : 'ALL');
    }
  }, [initialFilter]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [viewMode, setViewMode] = useState<'TRANSACTIONS' | 'PROFILE'>('TRANSACTIONS');



  // Use a function to initialize state so it runs only once
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => {
    if (initialCustomerId) {
      const all = StorageService.getCustomers();
      return all.find(c => c.id === initialCustomerId) || null;
    }
    return null;
  });
  useEffect(() => {
    if (selectedCustomer) {
      setViewMode('TRANSACTIONS');
    }
  }, [selectedCustomer, initialCustomerId]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'HISTORY' | 'STATEMENT' | 'NOTIFICATIONS'>('HISTORY');

  // Invoice Viewing State
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [pendingShareTx, setPendingShareTx] = useState<Transaction | null>(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [paymentNote, setPaymentNote] = useState('');

  // Statement State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // History Date Filter State
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');

  // Add Customer Modal State
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    state: '',
    gstin: ''
  });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [phoneSuggestions, setPhoneSuggestions] = useState<any[]>([]);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);

  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showShareMenu, setShowShareMenu] = useState(false);


  // Modal States
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string; variant?: 'success' | 'danger' | 'info' | 'warning' } | null>(null);

  const showAlert = (title: string, message: string, variant: 'success' | 'danger' | 'info' | 'warning' = 'info') => {
    setAlertConfig({ isOpen: true, title, message, variant });
  };

  const getCurrentGstEnabled = () => {
    const company = StorageService.getCompanyProfile();
    return company.gst_enabled;
  };

  const gstEnabledVal = getCurrentGstEnabled();

  useEffect(() => {
    setCustomers(StorageService.getCustomers());
    // Set default date range for statement (current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setStartDate(firstDay);
    setEndDate(lastDay);

    // Set history date filter to show current month by default
    setHistoryFromDate(firstDay);
    setHistoryToDate(lastDay);
  }, []);

  // Load history whenever selected customer changes
  useEffect(() => {
    if (selectedCustomer) {
      const allInvoices = StorageService.getInvoices();
      const allPayments = StorageService.getPayments();

      // Filter for this customer
      const custInvoices = allInvoices.filter(inv => inv.customerId === selectedCustomer.id);
      const custPayments = allPayments.filter(pay => pay.customerId === selectedCustomer.id);

      // Combine into Transactions
      const txs: Transaction[] = [
        ...custInvoices.map(inv => ({
          id: inv.id,
          date: inv.date,
          type: (inv.type === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE') as 'INVOICE' | 'CREDIT_NOTE',
          reference: inv.invoiceNumber,
          amount: inv.total,
          status: inv.status,
          mode: inv.status === 'PAID' ? 'CASH' : 'CREDIT',
          data: inv
        })),
        ...custPayments.map(pay => ({
          id: pay.id,
          date: pay.date,
          type: 'PAYMENT' as const,
          reference: pay.reference || 'Payment',
          amount: pay.amount,
          mode: pay.mode,
          data: pay
        }))
      ];

      // Sort descending
      txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(txs);
      setActiveTab('HISTORY');
    }
  }, [selectedCustomer]);

  const handleViewHistory = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid amount.', 'warning');
      return;
    }

    const payment: Payment = {
      id: crypto.randomUUID(),
      customerId: selectedCustomer.id,
      date: paymentDate,
      amount: amount,
      mode: paymentMode,
      note: paymentNote,
      reference: 'PAY-' + Date.now().toString().slice(-6)
    };

    StorageService.savePayment(payment);

    // Refresh Data
    const updatedCustomers = StorageService.getCustomers();
    setCustomers(updatedCustomers);
    const updatedSel = updatedCustomers.find(c => c.id === selectedCustomer.id) || null;
    setSelectedCustomer(updatedSel);
    if (updatedSel) handleViewHistory(updatedSel); // Refresh list

    // Show Success Modal via Alert? No, just close. Or Toast. 
    // User requested "Pop up redesign".
    showAlert('Payment Recorded', `Received ₹${amount} from ${selectedCustomer.company}`, 'success');

    setShowPaymentModal(false);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentMode('CASH');
  };

  const handleShare = async (tx: Transaction) => {
    if (!selectedCustomer) return;
    const company = StorageService.getCompanyProfile();

    if (selectedCustomer.phone) {
      if (tx.type === 'INVOICE') {
        await WhatsAppService.shareInvoice(tx.data as Invoice, selectedCustomer, company);
      } else {
        await WhatsAppService.sharePayment(tx.data as Payment, selectedCustomer, company);
      }
    } else {
      setPendingShareTx(tx);
      setShowWhatsAppModal(true);
    }
  };


  const handleSendReminder = () => {
    if (!selectedCustomer) return;
    StorageService.addNotification(selectedCustomer.id, {
      type: 'REMINDER',
      title: 'Payment Reminder Sent',
      message: `A payment reminder was sent to ${selectedCustomer.email}.`,
      date: new Date().toISOString().split('T')[0]
    });

    showAlert('Reminder Sent', `Reminder sent to ${selectedCustomer.email}`, 'success');
    // Refresh
    const updatedCustomers = StorageService.getCustomers();
    const updatedSelected = updatedCustomers.find(c => c.id === selectedCustomer.id) || null;
    setCustomers(updatedCustomers);
    setSelectedCustomer(updatedSelected);
  };

  const handleDownloadStatement = async () => {
    if (!selectedCustomer) return;

    const company = StorageService.getCompanyProfile();

    // Filter by date and Sort Ascending for Statement
    const filteredTxs = transactions.filter(t =>
      t.date >= startDate && t.date <= endDate
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text("STATEMENT OF ACCOUNT", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(company.name, 105, 30, { align: "center" });

    // Details
    doc.setFontSize(10);
    doc.text(`Customer: ${selectedCustomer.company} `, 14, 50);
    doc.text(`Period: ${formatDate(startDate)} to ${formatDate(endDate)} `, 14, 56);

    // Table Header
    let y = 70;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 6, 182, 8, 'F');
    doc.setFont("helvetica", "bold");
    doc.text("Date", 16, y);
    doc.text("Details / Ref", 45, y);
    doc.text("Debit", 130, y, { align: "right" });
    doc.text("Credit", 160, y, { align: "right" });
    doc.text("Mode", 190, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 10;

    let totalDebit = 0;
    let totalCredit = 0;

    filteredTxs.forEach(tx => {
      doc.text(formatDate(tx.date), 16, y);
      doc.text(tx.type === 'INVOICE' ? `Inv: ${tx.reference}` : tx.type === 'CREDIT_NOTE' ? `Ret: ${tx.reference}` : `Pay: ${tx.reference}`, 45, y);

      if (tx.type === 'INVOICE') {
        doc.text(tx.amount.toFixed(2), 130, y, { align: "right" });
        totalDebit += tx.amount;
      } else {
        doc.text("-", 130, y, { align: "right" });
      }

      if (tx.type === 'PAYMENT' || tx.type === 'CREDIT_NOTE') {
        doc.text(tx.amount.toFixed(2), 160, y, { align: "right" });
        totalCredit += tx.amount;
      } else {
        doc.text("-", 160, y, { align: "right" });
      }

      doc.text(tx.mode || '-', 190, y, { align: "right" });

      y += 8;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });

    y += 5;
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Totals:", 100, y);
    doc.text(totalDebit.toFixed(2), 130, y, { align: "right" });
    doc.text(totalCredit.toFixed(2), 160, y, { align: "right" });

    y += 10;
    doc.text("Current Outstanding Balance:", 130, y, { align: "right" });
    doc.text(`Rs.${selectedCustomer.balance.toFixed(2)} `, 160, y, { align: "right" });

    // Unified Save/Share Logic
    const fileName = `Statement_${selectedCustomer.name.replace(/[^a-zA-Z0-9]/g, '_')}_${startDate}.pdf`;
    if (Capacitor.isNativePlatform()) {
      try {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const cacheResult = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache
        });

        await Share.share({
          title: fileName,
          url: cacheResult.uri,
          dialogTitle: 'Save or Share Statement...'
        });
      } catch (err) {
        console.error('Mobile PDF share failed:', err);
        alert('Could not share PDF. Please check permissions.');
      }
    } else {
      doc.save(fileName);
    }
  };

  const handleShareClick = () => {
    if (!selectedCustomer) return;
    setShowShareMenu(!showShareMenu);
  };

  const handleWhatsAppShare = () => {
    if (!selectedCustomer) return;
    const message = `🧾 *Statement for ${selectedCustomer.name}*\n📅 Period: ${historyFromDate} to ${historyToDate}\n💰 Outstanding: ₹${selectedCustomer.balance?.toLocaleString()}\n\nShared via BillBookApp`;
    const url = `https://wa.me/91${selectedCustomer.phone}?text=${encodeURIComponent(message)}`;
    if (Capacitor.isNativePlatform()) {
      window.open(url, '_system');
    } else {
      window.open(url, '_blank');
    }
  };

  const handleDownloadHistoryStatement = async () => {
    if (!selectedCustomer) return;

    const company = StorageService.getCompanyProfile();
    const todayDate = formatDate(new Date());

    // Filter by history date range and Sort Ascending
    const filteredTxs = transactions.filter(t =>
      t.date >= historyFromDate && t.date <= historyToDate
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = 20;

    // ═══════════════════════════════════════════════════════════
    // HEADER - Company Name
    // ═══════════════════════════════════════════════════════════
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(company.name.toUpperCase(), pageWidth / 2, y, { align: 'center' });

    y += 10;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Ledger Report of ${(selectedCustomer.name || selectedCustomer.company || 'Customer').toUpperCase()}`, pageWidth / 2, y, { align: 'center' });

    y += 6;
    doc.setFontSize(9);
    doc.text(`Period: ${historyFromDate} to ${historyToDate}`, pageWidth / 2, y, { align: 'center' });

    y += 8;
    // Horizontal line
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 2;
    doc.line(margin, y, pageWidth - margin, y);

    y += 10;

    // ═══════════════════════════════════════════════════════════
    // T-FORMAT LEDGER: DEBIT | CREDIT
    // ═══════════════════════════════════════════════════════════

    const centerX = pageWidth / 2;
    const colWidth = (pageWidth - (margin * 2)) / 2;

    // Column Headers
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("DEBIT SIDE", margin + colWidth / 2, y, { align: 'center' });
    doc.text("CREDIT SIDE", centerX + colWidth / 2, y, { align: 'center' });

    y += 6;

    // Sub-headers
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");

    // Debit side headers
    // Debit side headers
    doc.text("Date", margin + 2, y);
    doc.text("Particulars", margin + 18, y);
    doc.text("St.", margin + colWidth - 18, y); // Status Column
    doc.text("Amount", margin + colWidth - 2, y, { align: 'right' });

    // Credit side headers
    doc.text("Date", centerX + 2, y);
    doc.text("Particulars", centerX + 18, y);
    doc.text("Amount", pageWidth - margin - 2, y, { align: 'right' });

    y += 5;

    // Separator line
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);

    y += 5;

    // Separate Debits and Credits
    const debits = filteredTxs.filter(tx => tx.type === 'INVOICE');
    const credits = filteredTxs.filter(tx => tx.type === 'PAYMENT' || tx.type === 'CREDIT_NOTE');

    let debitTotal = 0;
    let creditTotal = 0;

    const maxRows = Math.max(debits.length, credits.length);
    const startY = y;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);

    for (let i = 0; i < maxRows; i++) {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 20;
      }

      // DEBIT SIDE
      if (i < debits.length) {
        const deb = debits[i];
        const isPaid = deb.status === 'PAID';

        doc.setTextColor(0, 0, 0); // Always black for B&W compatibility

        doc.text(deb.date, margin + 2, y);

        // Truncate reference if too long
        const ref = deb.reference.length > 12 ? deb.reference.slice(0, 10) + '..' : deb.reference;
        doc.text(`Sale - #${ref}`, margin + 18, y);

        // Status Column
        doc.setFont("helvetica", isPaid ? "normal" : "bold");
        doc.text(isPaid ? "P" : "D", margin + colWidth - 18, y);
        doc.setFont("helvetica", "normal");

        // Amount
        const amountStr = deb.amount.toFixed(2);
        const amountX = margin + colWidth - 2;
        doc.text(amountStr, amountX, y, { align: 'right' });

        // Strikethrough if PAID
        if (isPaid) {
          const textWidth = doc.getTextWidth(amountStr);
          doc.setLineWidth(0.4);
          doc.setDrawColor(50, 50, 50); // Dark grey line
          // Adjust coordinates to strike through center of text
          // amountX is right aligned, so start x is (amountX - textWidth)
          doc.line(amountX - textWidth, y - 1, amountX, y - 1);
          doc.setDrawColor(0, 0, 0); // Reset
        }

        // Only add to debitTotal if invoice is PENDING (not paid)
        // WAIT: In double entry, we sum ALL debits usually. 
        // But this specific logic seems to exclude paid invoices from total?
        // Checking original logic: "Only add to debitTotal if invoice is PENDING"
        // Yes, existing logic excludes paid invoices from total calculation?
        // Let's verify line 456 of original file.
        // Yes: "if (!isPaid) { debitTotal += deb.amount; }"
        // Keeping logic identical to preserve balance calculation.
        if (!isPaid) {
          debitTotal += deb.amount;
        }
      }

      // CREDIT SIDE
      if (i < credits.length) {
        const cred = credits[i];
        const credLabel = cred.type === 'CREDIT_NOTE' ? `Ret - ${cred.reference}` : `Pay - ${cred.mode}`;
        doc.text(cred.date, centerX + 2, y);
        doc.text(credLabel, centerX + 18, y);
        doc.text(cred.amount.toFixed(2), pageWidth - margin - 2, y, { align: 'right' });
        creditTotal += cred.amount;
      }

      y += 5;
    }

    // Add vertical separator line between columns
    doc.setLineWidth(0.3);
    doc.line(centerX, startY - 5, centerX, y);

    // ═══════════════════════════════════════════════════════════
    // TOTALS and CLOSING BALANCE
    // ═══════════════════════════════════════════════════════════

    y += 3;
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    // Calculate actual closing balance from transactions
    const closingBalance = debitTotal - creditTotal;

    // Debit Total
    doc.text(debitTotal.toFixed(2), margin + colWidth - 2, y, { align: 'right' });

    // Credit Total
    doc.text("Total Cr.", centerX + 2, y);
    doc.text(creditTotal.toFixed(2), pageWidth - margin - 2, y, { align: 'right' });

    y += 8;

    // Closing Balance Row
    if (closingBalance >= 0) {
      // Dr. Balance - show on credit side to balance the ledger
      doc.text("Closing Balance (Dr.)", centerX + 2, y);
      doc.text(closingBalance.toFixed(2), pageWidth - margin - 5, y, { align: 'right' });
    } else {
      // Cr. Balance - show on debit side to balance the ledger
      doc.text("Closing Balance (Cr.)", margin + 2, y);
      doc.text(Math.abs(closingBalance).toFixed(2), margin + colWidth - 5, y, { align: 'right' });
    }

    y += 10;

    // ═══════════════════════════════════════════════════════════
    // OUTSTANDING BALANCE MESSAGE
    // ═══════════════════════════════════════════════════════════

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const balanceMsg = closingBalance >= 0
      ? `Aapka Balance baaki hai Rs ${closingBalance.toFixed(2)} (Dr.)`
      : `Aap humein dene hain Rs ${Math.abs(closingBalance).toFixed(2)} (Cr.)`;
    doc.text(balanceMsg, pageWidth / 2, y, { align: 'center' });

    y += 15;

    // ═══════════════════════════════════════════════════════════
    // UPI QR CODE
    // ═══════════════════════════════════════════════════════════

    if (company.upiId && closingBalance > 0 && y < pageHeight - 70) {
      try {
        const QRCode = (await import('qrcode')).default;
        const upiUrl = `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(company.name)}&am=${closingBalance.toFixed(2)}&cu=INR&tn=Payment`;
        const qrDataUrl = await QRCode.toDataURL(upiUrl);

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Scan to Pay", pageWidth / 2, y, { align: 'center' });

        y += 5;
        const qrSize = 45;
        doc.addImage(qrDataUrl, 'PNG', pageWidth / 2 - qrSize / 2, y, qrSize, qrSize);

        y += qrSize + 3;
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`UPI: ${company.upiId}`, pageWidth / 2, y, { align: 'center' });
      } catch (error) {
        console.error('QR generation failed:', error);
      }
    }

    // Footer - Company Name
    const footerY = pageHeight - 15;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(company.name.toUpperCase(), pageWidth - margin - 5, footerY, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Made from JLS Bill App", margin + 5, footerY);

    // Unified Save/Share Logic
    const fileName = `Ledger_${selectedCustomer.company.replace(/[^a-zA-Z0-9]/g, '_')}_${todayDate}.pdf`;
    if (Capacitor.isNativePlatform()) {
      try {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const cacheResult = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache
        });

        await Share.share({
          title: fileName,
          url: cacheResult.uri,
          dialogTitle: 'Save or Share Ledger...'
        });
      } catch (err) {
        console.error('Mobile PDF share failed:', err);
        alert('Could not share PDF. Please check permissions.');
      }
    } else {
      doc.save(fileName);
    }
  };

  if (selectedCustomer) {
    // Filter transactions by history date range
    const filteredHistoryTransactions = transactions.filter(tx => {
      const txDate = tx.date; // Format is YYYY-MM-DD
      return txDate >= historyFromDate && txDate <= historyToDate;
    });

    return (
      <div className="bg-surface-container-low min-h-screen font-sans">
        {/* Overlay for viewing invoice */}
        <AnimatePresence>
          {viewingInvoice && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed inset-0 z-[60] bg-surface overflow-y-auto"
            >
              <InvoiceView
                invoice={viewingInvoice}
                onBack={() => setViewingInvoice(null)}
                onEdit={(inv) => {
                  setViewingInvoice(null);
                  if (onEditInvoice) onEditInvoice(inv);
                }}
                onClosePostSaveActions={() => setViewingInvoice(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
          {/* Top Navigation */}
          <div className="flex items-center gap-4 pt-safe">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (initialCustomerId && onBack) {
                  onBack();
                } else {
                  setSelectedCustomer(null);
                }
              }}
              className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-foreground hover:bg-surface-container-highest transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
            <h2 className="text-xl font-bold text-foreground truncate max-w-[200px]">{selectedCustomer.company || selectedCustomer.name}</h2>
            {/* Subtle Edit Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => handleEditCustomer(selectedCustomer)}
              className="ml-auto w-9 h-9 rounded-full bg-transparent hover:bg-surface-container-high flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
              title="Edit Customer"
            >
              <Edit className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Ultra Compact Toggle Tabs */}
          {/* Slim Smart Toggle Tabs */}
          <div className="flex bg-surface-container-high/50 p-0.5 rounded-full w-full border border-border mb-4 max-w-sm mx-auto">
            <button
              onClick={() => setViewMode('TRANSACTIONS')}
              className={`flex-1 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'TRANSACTIONS' ? 'bg-white dark:bg-slate-800 text-google-blue shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
            >
              Transactions
            </button>
            <button
              onClick={() => setViewMode('PROFILE')}
              className={`flex-1 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'PROFILE' ? 'bg-white dark:bg-slate-800 text-google-blue shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
            >
              Profile
            </button>
          </div>

          {/* Transaction View Header Stats (Only in Transactions Mode) */}
          {viewMode === 'TRANSACTIONS' && (
            <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 rounded-2xl border border-border shadow-sm mb-4">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Net Balance</p>
                <p className={`text-xl font-black ${selectedCustomer.balance > 0 ? 'text-google-red' : 'text-google-green'}`}>
                  ₹{selectedCustomer.balance.toLocaleString('en-IN')}
                </p>
              </div>
              <button onClick={() => setShowPaymentModal(true)} className={`px-4 py-2 ${selectedCustomer.balance > 0 ? 'bg-google-green' : 'bg-google-blue'} text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg active:scale-95 transition-transform`}>
                {selectedCustomer.balance > 0 ? 'Receive Now' : 'Pay Now'}
              </button>
            </div>
          )}

          {/* Ultra-Compact App-style Profile Card */}
          {viewMode === 'PROFILE' && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface rounded-[24px] shadow-sm border border-border p-4 relative overflow-hidden"
            >
              <div className="flex items-center justify-between gap-4">
                {/* Left: Profile Info (Avatar Removed, Smart Font Scaling) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className={`font-black text-foreground tracking-tight leading-tight ${selectedCustomer.company.length > 25 ? 'text-sm' :
                      selectedCustomer.company.length > 15 ? 'text-base' : 'text-lg'
                      }`}>
                      {selectedCustomer.company}
                    </h1>
                    <div
                      className={`px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest shrink-0 ${(StorageService.getCustomerBehaviorScore(selectedCustomer.id)) > 80 ? 'bg-google-green/10 text-google-green' :
                        (StorageService.getCustomerBehaviorScore(selectedCustomer.id)) > 50 ? 'bg-orange-100 text-orange-700' : 'bg-google-red/10 text-google-red'
                        } `}
                    >
                      {StorageService.getCustomerBehaviorScore(selectedCustomer.id)}% Trust
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[11px] font-bold text-muted-foreground">{selectedCustomer.name}</p>
                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-muted-foreground/60" />
                      <Mail className="w-3 h-3 text-muted-foreground/60" />
                      <MapPin className="w-3 h-3 text-muted-foreground/60" />
                    </div>
                  </div>
                </div>

                {/* Right: Balance */}
                <div className="text-right shrink-0">
                  <p className="text-[7px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Balance</p>
                  <p className={`text-lg font-black tracking-tighter ${selectedCustomer.balance > 0 ? 'text-google-red' : 'text-google-green'} `}>
                    ₹{selectedCustomer.balance.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              {/* Action Row (Compact) */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-border/50">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowNoteModal(true)}
                  className="flex-1 py-2 bg-surface-container-high rounded-xl text-foreground text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border border-border"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Log Call
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowPaymentModal(true)}
                  className="flex-[1.5] py-2 bg-google-blue text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-google-blue/20 flex items-center justify-center gap-2"
                >
                  <Banknote className="w-3.5 h-3.5" /> Receive Payment
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Expressive Tabs */}


          {/* Tab Content Area */}
          <div className="bg-surface rounded-[40px] shadow-sm border border-border overflow-hidden min-h-[400px]">
            <AnimatePresence mode="wait">
              {viewMode === 'TRANSACTIONS' && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="overflow-x-auto"
                >
                  {/* Smart App-like Header for History */}
                  <div className="px-6 py-6 border-b border-border bg-surface-container-high/20">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-black tracking-tight text-foreground">Transaction History</h3>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Manage your customer ledger</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleShareClick}
                          className="flex items-center justify-center w-10 h-10 bg-google-blue/10 text-google-blue rounded-xl border border-google-blue/20"
                        >
                          <Share2 className="w-5 h-5" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleDownloadHistoryStatement}
                          className="px-5 py-2.5 bg-google-blue text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-google-blue/20 flex items-center gap-2 transition-all"
                        >
                          <Download className="w-4 h-4" /> Export PDF
                        </motion.button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
                      <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-high rounded-2xl border border-border min-w-fit">
                        <span className="text-[10px] font-black text-muted-foreground uppercase">From</span>
                        <input
                          type="date"
                          value={historyFromDate}
                          onChange={(e) => setHistoryFromDate(e.target.value)}
                          className="bg-transparent text-xs font-bold text-foreground outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-high rounded-2xl border border-border min-w-fit">
                        <span className="text-[10px] font-black text-muted-foreground uppercase">To</span>
                        <input
                          type="date"
                          value={historyToDate}
                          onChange={(e) => setHistoryToDate(e.target.value)}
                          className="bg-transparent text-xs font-bold text-foreground outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mobile-Optimized Transaction List */}
                  <div className="divide-y divide-border">
                    {filteredHistoryTransactions.map((tx) => (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="px-6 py-5 hover:bg-surface-container-high/30 transition-colors flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${tx.type === 'INVOICE' ? 'bg-blue-50 text-google-blue' :
                            tx.type === 'CREDIT_NOTE' ? 'bg-orange-50 text-orange-600' :
                              'bg-green-50 text-google-green'
                            }`}>
                            {tx.type === 'INVOICE' ? <FileText className="w-6 h-6" /> :
                              tx.type === 'CREDIT_NOTE' ? <ArrowLeft className="w-6 h-6" /> :
                                <Banknote className="w-6 h-6" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-bold text-muted-foreground">{formatDate(tx.date)}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter border ${tx.type === 'INVOICE'
                                ? tx.status === 'PAID' ? 'bg-green-100 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                                : tx.type === 'CREDIT_NOTE' ? 'bg-orange-100 border-orange-200 text-orange-700' : 'bg-green-50 border-green-200 text-green-700'
                                }`}>
                                {tx.type === 'INVOICE' ? tx.status : tx.type === 'CREDIT_NOTE' ? 'RETURN' : 'RECEIVED'}
                              </span>
                            </div>
                            <h4 className="text-sm font-black text-foreground truncate tracking-tight">
                              {tx.type === 'INVOICE' ? `Invoice #${tx.reference}` :
                                tx.type === 'CREDIT_NOTE' ? `Return #${tx.reference}` :
                                  `Payment via ${tx.mode}`}
                            </h4>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ID: {tx.data.id.slice(0, 6)}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className={`text-base font-black tracking-tighter ${tx.type === 'INVOICE' ? 'text-foreground' :
                            tx.type === 'CREDIT_NOTE' ? 'text-orange-600' :
                              'text-google-green'
                            }`}>
                            {tx.type === 'INVOICE' ? '+' : '-'}₹{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </p>
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <button
                              onClick={() => handleShare(tx)}
                              className="p-2 rounded-xl bg-surface-container-high text-muted-foreground hover:text-google-green transition-colors"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                            {(tx.type === 'INVOICE' || tx.type === 'CREDIT_NOTE') && (
                              <button
                                onClick={() => setViewingInvoice(tx.data as Invoice)}
                                className="p-2 rounded-xl bg-surface-container-high text-muted-foreground hover:text-google-blue transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {filteredHistoryTransactions.length === 0 && (
                      <div className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-50">
                          <FileText className="w-12 h-12 text-muted-foreground" />
                          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">No transaction records found</p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'STATEMENT' && (
                <motion.div
                  key="statement"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="p-12 flex flex-col items-center justify-center text-center max-w-2xl mx-auto"
                >
                  <div className="w-20 h-20 bg-google-blue/10 rounded-3xl flex items-center justify-center text-google-blue mb-6">
                    <TrendingUp className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-black font-heading text-foreground mb-2">Statement Generator</h3>
                  <p className="text-muted-foreground font-medium mb-10">Select a date range to generate a professional PDF account statement.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-8">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">From Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">To Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleDownloadStatement}
                    className="w-full bg-foreground text-surface py-5 rounded-full font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 shadow-lg hover:bg-foreground/90 transition-all"
                  >
                    <Download className="w-5 h-5" /> Download Statement
                  </motion.button>
                </motion.div>
              )}

              {activeTab === 'NOTIFICATIONS' && (
                <motion.div
                  key="notifications"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12"
                >
                  <div>
                    <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      Follow-up Notes <span className="bg-surface-container-highest px-2 py-0.5 rounded-full text-[9px] text-foreground">Internal</span>
                    </h3>
                    <div className="space-y-4">
                      {(selectedCustomer.followUpHistory || []).map((follow, idx) => (
                        <div key={idx} className="p-4 bg-surface-container-high/30 border border-border rounded-[24px]">
                          <p className="text-sm font-bold text-foreground mb-2">"{follow.note}"</p>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{follow.date}</p>
                        </div>
                      ))}
                      {(!selectedCustomer.followUpHistory || selectedCustomer.followUpHistory.length === 0) && (
                        <p className="text-sm text-muted-foreground italic pl-2">No internal notes added yet.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Activity Log</h3>
                      <button
                        onClick={handleSendReminder}
                        className="text-[10px] font-black uppercase tracking-widest text-google-blue hover:underline decoration-2 underline-offset-4"
                      >
                        Send Reminder Now
                      </button>
                    </div>

                    <div className="relative border-l-2 border-surface-container-highest ml-3 space-y-8 pl-8 py-2">
                      {(selectedCustomer.notifications || []).map((notif) => (
                        <div key={notif.id} className="relative">
                          <div className={`absolute - left - [41px] top - 0 w - 6 h - 6 rounded - full border - 4 border - surface flex items - center justify - center ${notif.type === 'INVOICE' ? 'bg-google-blue' :
                            notif.type === 'PAYMENT' ? 'bg-google-green' : 'bg-orange-400'
                            } `} />
                          <h4 className="text-sm font-bold text-foreground">{notif.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1 mb-1">{notif.message}</p>
                          <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">{notif.date}</span>
                        </div>
                      ))}
                      {(!selectedCustomer.notifications || selectedCustomer.notifications.length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No activity recorded yet.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* M3 Payment Modal */}
        <AnimatePresence>
          {showPaymentModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPaymentModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-surface w-full max-w-md rounded-[40px] shadow-google-lg overflow-hidden border border-border"
              >
                <div className="p-8 border-b border-border bg-surface-container-high/30 flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-black font-heading text-foreground">Receive Payment</h3>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Record transaction</p>
                  </div>
                  <button onClick={() => setShowPaymentModal(false)} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <form onSubmit={handleSavePayment} className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Amount Received</label>
                    <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl font-black text-foreground">₹</span>
                      <input
                        type="number"
                        required
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full p-6 pl-12 bg-surface-container-high border-2 border-transparent focus:border-google-green/30 rounded-[24px] text-3xl font-black text-foreground focus:ring-4 focus:ring-google-green/5 outline-none transition-all placeholder:text-muted-foreground/20"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Date</label>
                      <input
                        type="date"
                        required
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Mode</label>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value as any)}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all appearance-none"
                      >
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI / Online</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Reference Note</label>
                    <input
                      type="text"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      placeholder="Optional details..."
                    />
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    className="w-full bg-google-green text-white py-5 rounded-full font-black uppercase tracking-widest text-sm shadow-xl shadow-google-green/20 hover:shadow-google-lg mt-2"
                  >
                    Process Payment
                  </motion.button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }


  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.company || !newCustomer.email) {
      showAlert('Missing Information', 'Please fill name, company, and email', 'warning');
      return;
    }

    // Check for duplicates
    const isDuplicate = customers.some(c =>
      c.name.toLowerCase() === newCustomer.name.toLowerCase() ||
      c.company.toLowerCase() === newCustomer.company.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Duplicate Customer', 'A customer with this Name or Company already exists.', 'warning');
      return;
    }

    const customer: Customer = {
      id: crypto.randomUUID(),
      name: newCustomer.name,
      company: newCustomer.company,
      email: newCustomer.email,
      phone: newCustomer.phone,
      address: newCustomer.address,
      state: newCustomer.state,
      gstin: newCustomer.gstin,
      balance: 0,
      notifications: []
    };

    StorageService.saveCustomer(customer);
    setCustomers(StorageService.getCustomers());
    setShowAddCustomer(false);
    setNewCustomer({ name: '', company: '', email: '', phone: '', address: '', state: '', gstin: '' });
    showAlert('Customer Added', 'Customer has been added successfully!', 'success');
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer({ ...customer });
    setShowEditCustomer(true);
  };

  const handleSaveEditCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!editingCustomer.name || !editingCustomer.company || !editingCustomer.email) {
      showAlert('Missing Information', 'Please fill name, company, and email', 'warning');
      return;
    }

    StorageService.updateCustomer(editingCustomer);
    setCustomers(StorageService.getCustomers());
    setShowEditCustomer(false);
    setEditingCustomer(null);
    showAlert('Updated', 'Customer details updated successfully!', 'success');
  };

  const handleDeleteCustomer = (customerId: string) => {
    setCustomerToDelete(customerId);
  };

  const confirmDeleteCustomer = () => {
    if (customerToDelete) {
      StorageService.deleteCustomer(customerToDelete);
      setCustomers(StorageService.getCustomers());
      setShowEditCustomer(false);
      setEditingCustomer(null);
      setCustomerToDelete(null);
      showAlert('Deleted', 'Customer has been permanently deleted.', 'success');
    }
  };





  return (
    <div className="bg-surface-container-low min-h-screen font-sans">
      {/* Simplified Share Menu for Ledger */}
      <AnimatePresence>
        {showShareMenu && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setShowShareMenu(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-[280px] bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-3"
            >
              <div className="text-center pb-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Share Statement</p>
              </div>

              <button
                onClick={() => {
                  handleWhatsAppShare();
                  setShowShareMenu(false);
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 active:scale-95 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <span className="font-bold text-sm">WhatsApp PDF</span>
              </button>

              <button
                onClick={() => {
                  handleDownloadHistoryStatement();
                  setShowShareMenu(false);
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 active:scale-95 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
                  <Download className="w-5 h-5" />
                </div>
                <span className="font-bold text-sm">Download PDF</span>
              </button>

              <button
                onClick={() => setShowShareMenu(false)}
                className="w-full p-3 text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Modals */}
      <AlertModal
        isOpen={!!alertConfig}
        title={alertConfig?.title || ''}
        message={alertConfig?.message || ''}
        variant={alertConfig?.variant}
        onClose={() => setAlertConfig(null)}
      />

      <ConfirmationModal
        isOpen={!!customerToDelete}
        title="Delete Customer?"
        message="Are you sure you want to delete this customer? This will also delete all their invoices and payments history. This action cannot be undone."
        confirmText="Delete Customer"
        variant="danger"
        onClose={() => setCustomerToDelete(null)}
        onConfirm={confirmDeleteCustomer}
      />
      {/* Edit Customer Modal */}
      <AnimatePresence>
        {showEditCustomer && editingCustomer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowEditCustomer(false); setEditingCustomer(null); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-surface w-full max-w-xl rounded-[40px] shadow-google-lg overflow-hidden border border-border max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8 border-b border-border bg-surface-container-high/30 flex justify-between items-center sticky top-0 backdrop-blur-md z-10">
                <div>
                  <h3 className="text-2xl font-black font-heading text-foreground">Edit Customer</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Update client profile</p>
                </div>
                <button onClick={() => { setShowEditCustomer(false); setEditingCustomer(null); }} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="p-8">
                <form onSubmit={handleSaveEditCustomer} className="space-y-6">
                  <div className="group space-y-2 relative">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Customer Name</label>
                    <input
                      type="text"
                      required
                      value={editingCustomer.name}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      placeholder="Full name"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Company Name</label>
                    <input
                      type="text"
                      required
                      value={editingCustomer.company}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, company: e.target.value })}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      placeholder="Company Name"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Email</label>
                      <input
                        type="email"
                        required
                        value={editingCustomer.email}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Phone</label>
                      <input
                        type="tel"
                        value={editingCustomer.phone}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Address</label>
                    <textarea
                      value={editingCustomer.address}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                      rows={2}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all resize-none"
                    />
                  </div>

                  {gstEnabledVal && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">State</label>
                        <input
                          type="text"
                          value={editingCustomer.state || ''}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, state: e.target.value })}
                          className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">GSTIN</label>
                        <input
                          type="text"
                          value={editingCustomer.gstin || ''}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, gstin: e.target.value })}
                          className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4 pt-4">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="submit"
                      className="flex-1 bg-google-blue text-white py-4 rounded-full font-black uppercase tracking-widest text-xs shadow-lg shadow-google-blue/20"
                    >
                      Save Changes
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => handleDeleteCustomer(editingCustomer.id)}
                      className="px-6 bg-google-red/10 text-google-red py-4 rounded-full font-black hover:bg-google-red/20 flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </motion.button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">

        {/* Filtering Logic */}
        {(() => {
          // We compute this here to ensure it uses the latest state
          // Use a new variable to avoid conflict if filteredCustomers exists
          const filteredList = customers.filter(c => {
            const lowerSearch = searchTerm.toLowerCase();
            const matchesSearch = c.company.toLowerCase().includes(lowerSearch) ||
              c.name.toLowerCase().includes(lowerSearch);
            if (!matchesSearch) return false;

            if (activeFilter === 'RECEIVABLE') return c.balance > 0;
            if (activeFilter === 'PAYABLE') return c.balance < 0;

            return true;
          });

          return (
            <>
              {/* Compact Header */}
              <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
                <div className="flex items-center justify-between px-4 h-14">
                  <div className="flex items-center gap-3">
                    {onBack && (
                      <button onClick={onBack} className="p-2 -ml-2 rounded-full active:bg-slate-100 dark:active:bg-slate-800">
                        <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                      </button>
                    )}
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Parties</h2>
                  </div>
                  <button
                    onClick={() => setShowAddCustomer(true)}
                    className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center shadow-lg"
                  >
                    <Plus className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Search Bar - Full Width */}
              <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-2">
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search parties..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                  />
                </div>

                {/* Navigation/Filter Chips */}
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    onClick={() => setActiveFilter('ALL')}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all shrink-0 ${activeFilter === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                      : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-800'
                      }`}
                  >
                    All Parties
                  </button>
                  <button
                    onClick={() => setActiveFilter('RECEIVABLE')}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all shrink-0 ${activeFilter === 'RECEIVABLE'
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-transparent text-emerald-600 border-emerald-200'
                      }`}
                  >
                    Receivables
                  </button>
                  <button
                    onClick={() => setActiveFilter('PAYABLE')}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all shrink-0 ${activeFilter === 'PAYABLE'
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-transparent text-red-600 border-red-200'
                      }`}
                  >
                    Payables
                  </button>
                </div>
              </div>

              {/* Summary Stats - Compact */}
              <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="p-3 border-r border-slate-200 dark:border-slate-800">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Parties</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{filteredList.length}</p>
                </div>
                <div className="p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Receivable</p>
                  <p className="text-lg font-black text-emerald-500">
                    ₹{filteredList.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              {/* Customer List - Compact Single Line */}
              <div className="bg-white dark:bg-slate-900">
                {filteredList.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <UserPlus className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-400">{searchTerm ? 'No matches' : 'No parties yet'}</p>
                    <p className="text-xs text-slate-400 mt-1">Tap + to add your first party</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredList.map((customer, idx) => (
                      <motion.div
                        key={customer.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        onClick={() => handleViewHistory(customer)}
                        className="px-4 py-3 flex items-center justify-between active:bg-slate-50 dark:active:bg-slate-800 cursor-pointer"
                      >
                        {/* Left: Avatar & Name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 text-blue-500 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                            {customer.company.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate">{customer.company}</p>
                            <p className="text-[10px] text-slate-400 truncate">{customer.name} {customer.phone && `• ${customer.phone}`}</p>
                          </div>
                        </div>

                        {/* Right: Balance & Arrow */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className={`text-[12px] font-bold ${customer.balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              ₹{Math.abs(customer.balance).toLocaleString('en-IN')}
                            </p>
                            <p className="text-[8px] text-slate-400">{customer.balance > 0 ? 'Due' : 'Paid'}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Safe Area */}
              {/* Bottom Safe Area */}
              <div className="h-24" />
            </>
          );
        })()}
      </div>

      {/* Add Customer Modal - M3 Expressive */}
      <AnimatePresence>
        {
          showAddCustomer && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAddCustomer(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-surface w-full max-w-xl rounded-[40px] shadow-google-lg overflow-hidden border border-border max-h-[90vh] overflow-y-auto"
              >
                <div className="p-8 border-b border-border bg-surface-container-high/30 flex justify-between items-center sticky top-0 backdrop-blur-md z-10">
                  <div>
                    <h3 className="text-2xl font-black font-heading text-foreground">New Customer</h3>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Add client details</p>
                  </div>
                  <button onClick={() => setShowAddCustomer(false)} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <div className="p-8">
                  <form onSubmit={handleAddCustomer} className="space-y-6">
                    <div className="group space-y-2 relative">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          Customer Name <span className="w-1 h-1 rounded-full bg-google-red" />
                        </span>
                        {newCustomer.name.length >= 2 && suggestions.length === 0 && (
                          <span className="text-[9px] text-muted-foreground/60 normal-case tracking-normal">
                            No contacts found
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={newCustomer.name}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setNewCustomer({ ...newCustomer, name: val });
                            if (val.length >= 2) {
                              const results = await ContactsService.searchContacts(val);
                              setSuggestions(results);
                              setShowSuggestions(results.length > 0);
                            } else {
                              setShowSuggestions(false);
                            }
                          }}
                          onFocus={async () => {
                            await ContactsService.requestWithDisclosure();
                          }}
                          className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-lg font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30"
                          placeholder="Type to search contacts..."
                        />
                        {/* Searching indicator */}
                        {newCustomer.name.length >= 2 && newCustomer.name.length < 20 && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-google-blue/20 border-t-google-blue rounded-full animate-spin"></div>
                          </div>
                        )}
                      </div>

                      {/* Contact Suggestions Dropdown - Enhanced */}
                      <AnimatePresence>
                        {showSuggestions && suggestions.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute z-[120] left-0 right-0 top-full mt-2 bg-surface-container-highest border-2 border-google-blue/20 rounded-[28px] shadow-google-lg overflow-hidden"
                          >
                            <div className="bg-gradient-to-r from-google-blue/10 to-google-blue/5 px-4 py-2 border-b border-google-blue/10">
                              <p className="text-[10px] font-black text-google-blue uppercase tracking-widest flex items-center gap-2">
                                <UserPlus className="w-3 h-3" />
                                {suggestions.length} Contact{suggestions.length > 1 ? 's' : ''} Found
                              </p>
                            </div>
                            <div className="p-2 max-h-60 overflow-y-auto">
                              {suggestions.map((s, i) => (
                                <motion.button
                                  key={i}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  type="button"
                                  onClick={() => {
                                    setNewCustomer(prev => ({
                                      ...prev,
                                      name: s.name,
                                      phone: s.phone.replace(/\D/g, '').slice(-10),
                                      company: prev.company || s.name
                                    }));
                                    setShowSuggestions(false);
                                    HapticService.light();
                                  }}
                                  className="w-full p-4 flex items-center justify-between hover:bg-surface-container-high rounded-[20px] transition-all text-left border-2 border-transparent hover:border-google-blue/20 mb-1"
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-google-blue/20 to-google-blue/10 text-google-blue flex items-center justify-center font-black text-lg shrink-0 group-hover:from-google-blue group-hover:to-google-blue/80 group-hover:text-white transition-all shadow-sm">
                                      {s.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-base font-black text-foreground truncate mb-0.5">{s.name}</div>
                                      <div className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                        <Phone className="w-3 h-3" />
                                        <span className="tracking-wide">{s.phone}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-google-blue transition-colors" />
                                </motion.button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                        Company Name <span className="w-1 h-1 rounded-full bg-google-red" />
                      </label>
                      <input
                        type="text"
                        required
                        value={newCustomer.company}
                        onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-lg font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30"
                        placeholder="Business Name"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                        Email <span className="w-1 h-1 rounded-full bg-google-red" />
                      </label>
                      <input
                        type="email"
                        required
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30"
                        placeholder="email@example.com"
                      />
                    </div>

                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 flex items-center justify-between">
                        <span>Phone Number</span>
                        {newCustomer.phone.length >= 3 && phoneSuggestions.length === 0 && (
                          <span className="text-[9px] text-muted-foreground/60 normal-case tracking-normal">
                            No contacts found
                          </span>
                        )}
                      </label>
                      <div className="flex gap-3">
                        <div className="relative flex-1">
                          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-google-blue font-black">+91</span>
                          <input
                            type="tel"
                            value={newCustomer.phone}
                            onChange={async (e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              setNewCustomer({ ...newCustomer, phone: val });
                              if (val.length >= 3) {
                                const results = await ContactsService.searchByPhone(val);
                                setPhoneSuggestions(results);
                                setShowPhoneSuggestions(results.length > 0);
                              } else {
                                setShowPhoneSuggestions(false);
                              }
                            }}
                            className="w-full p-4 pl-16 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-black text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all tracking-widest placeholder:text-muted-foreground/30"
                            placeholder="Type number to search..."
                          />
                          {/* Searching indicator */}
                          {newCustomer.phone.length >= 3 && newCustomer.phone.length < 10 && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              <div className="w-4 h-4 border-2 border-google-blue/20 border-t-google-blue rounded-full animate-spin"></div>
                            </div>
                          )}
                        </div>
                        {/* Pick Contact Button - More Prominent */}
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={async () => {
                            HapticService.light();
                            const contact = await ContactsService.pickContact();
                            if (contact) {
                              setNewCustomer(prev => ({
                                ...prev,
                                name: prev.name || contact.name,
                                phone: contact.phone,
                                company: prev.company || contact.name
                              }));
                              setShowPhoneSuggestions(false);
                              HapticService.success();
                            }
                          }}
                          className="w-16 h-16 shrink-0 bg-gradient-to-br from-google-blue to-google-blue/80 hover:from-google-blue/90 hover:to-google-blue/70 border-2 border-google-blue/20 rounded-[20px] flex flex-col items-center justify-center transition-all shadow-lg shadow-google-blue/20 hover:shadow-xl hover:shadow-google-blue/30"
                          title="Pick from Contacts"
                        >
                          <UserPlus className="w-6 h-6 text-white mb-0.5" />
                          <span className="text-[8px] font-black text-white/90 uppercase tracking-wider">Pick</span>
                        </motion.button>
                      </div>

                      {/* Phone Suggestions Dropdown - Enhanced */}
                      <AnimatePresence>
                        {showPhoneSuggestions && phoneSuggestions.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute z-[120] left-0 right-0 top-full mt-2 bg-surface-container-highest border-2 border-google-blue/20 rounded-[28px] shadow-google-lg overflow-hidden"
                          >
                            <div className="bg-gradient-to-r from-google-blue/10 to-google-blue/5 px-4 py-2 border-b border-google-blue/10">
                              <p className="text-[10px] font-black text-google-blue uppercase tracking-widest flex items-center gap-2">
                                <Phone className="w-3 h-3" />
                                {phoneSuggestions.length} Contact{phoneSuggestions.length > 1 ? 's' : ''} Found
                              </p>
                            </div>
                            <div className="p-2 max-h-60 overflow-y-auto">
                              {phoneSuggestions.map((s, i) => (
                                <motion.button
                                  key={i}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  type="button"
                                  onClick={() => {
                                    setNewCustomer(prev => ({
                                      ...prev,
                                      name: prev.name || s.name,
                                      phone: s.phone.replace(/\D/g, '').slice(-10),
                                      company: prev.company || s.name
                                    }));
                                    setShowPhoneSuggestions(false);
                                    HapticService.light();
                                  }}
                                  className="w-full p-4 flex items-center justify-between hover:bg-surface-container-high rounded-[20px] transition-all text-left border-2 border-transparent hover:border-google-blue/20 mb-1"
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-google-blue/20 to-google-blue/10 text-google-blue flex items-center justify-center font-black text-lg shrink-0 group-hover:from-google-blue group-hover:to-google-blue/80 group-hover:text-white transition-all shadow-sm">
                                      {s.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-base font-black text-foreground truncate mb-0.5">{s.name}</div>
                                      <div className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                        <Phone className="w-3 h-3" />
                                        <span className="tracking-wide">{s.phone}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-google-blue transition-colors" />
                                </motion.button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Billing Address</label>
                      <textarea
                        value={newCustomer.address}
                        onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                        rows={2}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30 resize-none"
                        placeholder="Full Address"
                      />
                    </div>

                    {gstEnabledVal && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">State</label>
                          <input
                            type="text"
                            value={newCustomer.state}
                            onChange={(e) => setNewCustomer({ ...newCustomer, state: e.target.value })}
                            className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                            placeholder="State Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">GSTIN (Optional)</label>
                          <input
                            type="text"
                            value={newCustomer.gstin}
                            onChange={(e) => setNewCustomer({ ...newCustomer, gstin: e.target.value })}
                            className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                            placeholder="GST Number"
                            maxLength={15}
                          />
                        </div>
                      </div>
                    )}

                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="submit"
                      className="w-full bg-google-blue text-white py-5 rounded-full font-black uppercase tracking-widest text-sm shadow-xl shadow-google-blue/20 hover:shadow-google-lg mt-4"
                    >
                      Add Customer to Database
                    </motion.button>
                  </form>
                </div>
              </motion.div>
            </div>
          )
        }
      </AnimatePresence>
      <WhatsAppNumberModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        onSubmit={async (phone) => {
          if (pendingShareTx && selectedCustomer) {
            const company = StorageService.getCompanyProfile();
            if (pendingShareTx.type === 'INVOICE') {
              await WhatsAppService.shareInvoice(pendingShareTx.data as Invoice, selectedCustomer, company, phone);
            } else {
              await WhatsAppService.sharePayment(pendingShareTx.data as Payment, selectedCustomer, company, phone);
            }
            setPendingShareTx(null);
          }
        }}
      />
      <InputModal
        isOpen={showNoteModal}
        onClose={() => setShowNoteModal(false)}
        title="Log Call / Follow-up"
        placeholder="e.g. Called for payment, Agreed to pay Monday"
        submitLabel="Save Note"
        onSubmit={(note) => {
          if (selectedCustomer && typeof selectedCustomer === 'object') {
            const updated: Customer = Object.assign({}, selectedCustomer);
            if (!updated.followUpHistory) updated.followUpHistory = [];
            updated.followUpHistory.unshift({ date: new Date().toISOString().split('T')[0], note });
            StorageService.updateCustomer(updated);
            setSelectedCustomer(updated);
            HapticService.light();
          }
        }}
      />
    </div>
  );
};

export default Customers;
