
import React, { useState, useEffect } from 'react';
import { Invoice, CompanyProfile, DEFAULT_COMPANY, Customer } from '../types';
import { StorageService } from '../services/storageService';
import { ArrowLeft, Download, Edit, Trash2, MoreVertical, MessageCircle, Users, ChevronRight, FileText, Share2, Languages, Loader2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { InvoicePdfService } from '../services/invoicePdfService';
import { AIService } from '../services/aiService';
import QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'framer-motion';

import { Share } from '@capacitor/share';
import { ContactService } from '../services/contactService';
import ContactPermissionModal from './ContactPermissionModal';
import { useAI } from '@/contexts/AIContext';
import { formatDate } from '../utils/dateUtils';

interface InvoiceViewProps {
  invoice: Invoice;
  onBack: () => void;
  onEdit: (invoice: Invoice) => void;
  onViewLedger?: (customerId: string) => void;
  onDelete?: (invoice: Invoice) => void;
  showPostSaveActions?: boolean;
  onClosePostSaveActions?: () => void;
  isPublicView?: boolean; // Added for public read-only mode
}



const InvoiceView: React.FC<InvoiceViewProps> = ({ invoice, onBack, onEdit, onDelete, showPostSaveActions = false,
  onClosePostSaveActions,
  isPublicView = false
}) => {
  const { company: firebaseCompany } = useCompany();
  const { showKeySetup, isConfigured: isAIConfigured } = useAI();
  const [company, setCompany] = useState<CompanyProfile>(DEFAULT_COMPANY);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Toggles
  const [showOptions, setShowOptions] = useState(false);
  const isPosView = invoice.customerName?.toUpperCase() === 'CASH' || invoice.customerName?.toUpperCase() === 'CASH SALES';
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  // WhatsApp & Actions State
  const [showWhatsAppPhoneModal, setShowWhatsAppPhoneModal] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waName, setWaName] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Share Options
  const [shareWithPdf, setShareWithPdf] = useState(false);
  const [shareTranslated, setShareTranslated] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const [showContactChoice, setShowContactChoice] = useState(false);

  const [showPrevBalance, setShowPrevBalance] = useState(false);
  const [prevBalance, setPrevBalance] = useState(0);
  const [showShareMenu, setShowShareMenu] = useState(false);

  useEffect(() => {
    let companyData: CompanyProfile;

    if (firebaseCompany?.name) {
      companyData = {
        name: firebaseCompany.name || '',
        address: firebaseCompany.address || '',
        phone: firebaseCompany.phone || '',
        email: firebaseCompany.email || '',
        state: (firebaseCompany as any).state || '',
        gst: (firebaseCompany as any).gst || '',
        gstin: (firebaseCompany as any).gstin || (firebaseCompany as any).gst || '',
        gst_enabled: firebaseCompany.gst_enabled ?? true,
        show_hsn_summary: firebaseCompany.show_hsn_summary ?? true,
        upiId: (firebaseCompany as any).upiId || company?.upiId || '',
        invoiceSettings: (firebaseCompany as any).invoiceSettings
      };
    } else {
      const stored = StorageService.getCompanyProfile();
      companyData = {
        ...stored,
        gstin: stored.gstin || stored.gst || '',
        gst_enabled: stored.gst_enabled ?? true,
        show_hsn_summary: stored.show_hsn_summary ?? true
      };
    }
    setCompany(companyData);

    // Default WhatsApp translation based on company settings
    if (companyData.invoiceSettings?.language === 'Hindi' || companyData.invoiceSettings?.language === 'Hinglish') {
      setShareTranslated(true);
    }

    // Get Customer Details
    const cust = StorageService.getCustomers().find(c => c.id === invoice.customerId);
    if (cust) {
      setCustomer(cust);
      setWaPhone(cust.phone || '');
      setWaName(cust.company || cust.name || '');

      // Calculate Previous Balance
      const currentDue = cust.balance || 0;
      // If invoice reflects a stored previous balance, use it
      if (invoice.previousBalance !== undefined && invoice.previousBalance > 0) {
        setPrevBalance(invoice.previousBalance);
        setShowPrevBalance(true);
      } else {
        // If invoice is unpaid, subtract its amount to get 'previous' balance
        const invAmountInBalance = (invoice.status === 'PENDING' || invoice.status === 'PARTIAL') ? invoice.total : 0;
        setPrevBalance(currentDue - invAmountInBalance);
      }
    }

    // Generate QR Code
    if (companyData.upiId) {
      const upiUrl = `upi://pay?pa=${companyData.upiId}&pn=${encodeURIComponent(companyData.name)}&am=${invoice.total}&cu=INR&tn=${encodeURIComponent(`Inv-${invoice.invoiceNumber}`)}`;
      QRCode.toDataURL(upiUrl)
        .then(url => setQrCodeUrl(url))
        .catch(err => console.error(err));
    }
  }, [invoice, firebaseCompany]);

  useEffect(() => {
    if (showPostSaveActions) {
      setShowWhatsAppPhoneModal(true);
    }
  }, [showPostSaveActions]);

  const handlePickContact = async () => {
    const pref = StorageService.getContactPreference();
    if (pref === 'NOT_SET' && Capacitor.isNativePlatform()) {
      setShowContactChoice(true);
      return;
    }

    const contact = await ContactService.pickContact();
    if (contact) {
      setWaPhone(ContactService.normalizePhone(contact.phone));
      setWaName(contact.name);
    }
  };

  const onContactChoice = async (choice: 'ALL' | 'SELECTED') => {
    StorageService.setContactPreference(choice);
    setShowContactChoice(false);
    if (choice === 'ALL') {
      // Use ContactService for permission handling
      await ContactService.requestPermissions();
    } else {
      handlePickContact();
    }
  };



  const sendWhatsApp = async (phone: string, name: string) => {
    setIsTranslating(true);
    try {
      // Generate Item List String
      let itemsList = "";
      invoice.items.forEach((item, index) => {
        itemsList += `${index + 1}. *${item.description}* \n   ${item.quantity} x ₹${item.rate} = *₹${(item.totalAmount || 0).toLocaleString()}*\n`;
      });

      const dateStr = formatDate(invoice.date);

      let message = `🧾 *INVOICE: #${invoice.invoiceNumber}*\n` +
        `📅 ${dateStr}\n\n` +
        `*Billed To:* ${name || 'Customer'}\n\n` +
        `*Items:*\n` +
        `${itemsList}\n` +
        `--------------------------------\n` +
        `*NET TOTAL: ₹${invoice.total.toLocaleString()}*\n`;

      if (showPrevBalance && prevBalance !== 0) {
        message += `*Prev. Balance: ₹${prevBalance.toLocaleString()}*\n`;
        message += `*Grand Total: ₹${(invoice.total + prevBalance).toLocaleString()}*\n`;
      }

      message += `--------------------------------\n\n` +
        `Thank you!\n` +
        `*${company.name}*`;

      // Translation
      if (shareTranslated) {
        if (!isAIConfigured) {
          setIsTranslating(false);
          showKeySetup("WhatsApp Translation");
          return;
        }
        const targetLang = company.invoiceSettings?.language || 'Hinglish';
        message = await AIService.translateContent(message, targetLang as any);
      }

      if (shareWithPdf) {
        // Native Share with File
        const pdfPath = await InvoicePdfService.generatePDF(invoice, company, customer, qrCodeUrl, showPrevBalance, false); // False = Don't auto-share
        if (pdfPath && Capacitor.isNativePlatform()) {
          console.log("Sharing PDF Path:", pdfPath);
          await Share.share({
            title: `Invoice ${invoice.invoiceNumber}`,
            text: message,
            files: [pdfPath],
            dialogTitle: 'Share Invoice via...'
          });
        } else {
          // Web/Fallback
          await InvoicePdfService.generatePDF(invoice, company, customer, qrCodeUrl, showPrevBalance, true);
        }
      } else {
        // Direct WhatsApp Text
        const url = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
        if (Capacitor.isNativePlatform()) {
          // Use window.open with _system for Android/iOS native browser/app handling
          window.open(url, '_system');
        } else {
          window.open(url, '_blank');
        }
      }
    } catch (e) {
      console.error("Share Failed", e);
      alert("Sharing failed. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  };





  const handleHeaderWhatsAppClick = () => {
    if (waPhone && waPhone.length >= 10) {
      sendWhatsApp(waPhone, waName);
    } else {
      setShowWhatsAppPhoneModal(true);
    }
  };

  const handleDownload = async () => {
    try {
      // Check if multi-lingual PDF is requested but AI is not ready
      if (company.invoiceSettings?.language && company.invoiceSettings.language !== 'English' && !isAIConfigured && !AIService.isConfigured()) {
        showKeySetup(`Auto-Translation (${company.invoiceSettings.language})`);
        return;
      }
      await InvoicePdfService.generatePDF(invoice, company, customer, qrCodeUrl, showPrevBalance);
    } catch (error: any) {
      console.error("Download failed:", error);
      if (error.message?.includes('API key')) {
        showKeySetup("Gemini API (Invalid Key)");
      } else {
        alert(error.message || "Failed to download PDF. Please check your internet connection and try again.");
      }
    }
  };

  const handleShareClick = () => {
    setShowShareMenu(!showShareMenu);
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(invoice);
    } else {
      StorageService.deleteInvoice(invoice.id);
      onBack();
    }
  };

  return (
    <div className="min-h-screen bg-surface-container-low pb-32">
      {/* Custom Print Style */}
      {/* Custom Print Style - Safe Implementation */}
      <style>
        {`
            @media print {
                body * { visibility: hidden; }
                #printable-area, #printable-area * { visibility: visible; }
                #printable-area { position: absolute; left: 0; top: 0; width: 100%; }
                .no-print { display: none !important; }
            }
        `}
      </style>

      {/* Header Redesigned: Compact with Share & Edit Icons */}
      <div className="sticky top-0 z-[100] bg-surface-container-low/90 backdrop-blur-md px-4 py-4 border-b border-border flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-foreground active:bg-surface-container-highest transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>
          <div>
            <h2 className="text-lg font-black font-heading text-foreground tracking-tight">View Bill</h2>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${invoice.type === 'CREDIT_NOTE' ? 'bg-orange-500' : invoice.status === 'PAID' ? 'bg-google-green' : 'bg-orange-400'}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                {invoice.type === 'CREDIT_NOTE' ? 'CREDIT NOTE' : invoice.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleHeaderWhatsAppClick}
            className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-google-green border border-border/50"
          >
            <MessageCircle className="w-5 h-5" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleDownload}
            className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-foreground border border-border/50"
          >
            <Download className="w-5 h-5" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleShareClick}
            className="w-10 h-10 rounded-full bg-google-blue/10 flex items-center justify-center text-google-blue border border-google-blue/20"
          >
            <Share2 className="w-5 h-5" />
          </motion.button>

          {!isPublicView && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => onEdit(invoice)}
              className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-foreground border border-border/50"
            >
              <Edit className="w-5 h-5" />
            </motion.button>
          )}

          {!isPublicView && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowOptions(!showOptions)}
              className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-foreground"
            >
              <MoreVertical className="w-5 h-5" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Main Content */}
      {/* Main Content */}
      <div id="printable-area" className="max-w-4xl mx-auto p-2 md:p-4">
        <div className={`bg-surface ${isPosView ? 'rounded-[12px]' : 'rounded-3xl shadow-sm'} border border-border overflow-hidden`}>

          {/* Compact Quick Summary Bar - Now includes Invoice Number */}
          <div className="bg-surface-container-high/20 p-4 border-b border-border">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Bill #{invoice.invoiceNumber}</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{formatDate(invoice.date)}</span>
                </div>
                <p className="text-lg font-black text-foreground">{invoice.customerName}</p>
                {invoice.customerGstin && (
                  <span className="text-[8px] font-black text-google-blue uppercase tracking-tighter">GST: {invoice.customerGstin}</span>
                )}
              </div>
            </div>
          </div>

          <div className="p-0">
            {/* Items Table - REDESIGNED FOR MAX ITEMS */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-container-low border-b border-border">
                    <th className="px-4 py-3 text-left font-black text-muted-foreground uppercase tracking-widest w-10 text-[9px]">#</th>
                    <th className="px-4 py-3 text-left font-black text-muted-foreground uppercase tracking-widest text-[9px]">Item Description</th>
                    <th className="px-4 py-3 text-center font-black text-muted-foreground uppercase tracking-widest text-[9px]">Qty</th>
                    <th className="px-3 py-3 text-right font-black text-muted-foreground uppercase tracking-widest text-[9px]">Rate</th>
                    {invoice.gstEnabled && <th className="px-3 py-3 text-right font-black text-muted-foreground uppercase tracking-widest text-[9px]">GST</th>}
                    <th className="px-4 py-3 text-right font-black text-muted-foreground uppercase tracking-widest text-[9px]">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {invoice.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-high/20 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground font-bold">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col leading-tight">
                          <span className="font-bold text-foreground">{item.description}</span>
                          {item.hsn && <span className="text-[8px] text-muted-foreground">HSN: {item.hsn}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-container-high text-foreground font-black">
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-muted-foreground">₹{item.rate.toLocaleString()}</td>
                      {invoice.gstEnabled && <td className="px-3 py-2.5 text-right font-medium text-muted-foreground">{item.gstRate}%</td>}
                      <td className="px-4 py-2.5 text-right font-black text-foreground">₹{(item.totalAmount ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-surface-container-high/10">
                  <tr className="border-t border-border">
                    <td colSpan={2} className="px-4 py-4 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Qty:</span>
                        <span className="text-sm font-black text-foreground">
                          {invoice.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}
                        </span>
                      </div>
                    </td>
                    <td colSpan={invoice.gstEnabled ? 4 : 3} className="px-4 py-4">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex justify-between w-full max-w-[200px] text-[10px] font-bold text-muted-foreground">
                          <span>Subtotal:</span>
                          <span>₹{invoice.subtotal.toLocaleString()}</span>
                        </div>
                        {(invoice.discountAmount ?? 0) > 0 && (
                          <div className="flex justify-between w-full max-w-[200px] text-[10px] font-bold text-google-red">
                            <span>Discount:</span>
                            <span>-₹{(invoice.discountAmount ?? 0).toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between w-full max-w-[200px] text-lg font-black text-foreground mt-1 py-1 border-t border-border/30">
                          <span>TOTAL:</span>
                          <span className={invoice.type === 'CREDIT_NOTE' ? 'text-orange-500' : 'text-google-green'}>
                            ₹{invoice.total.toLocaleString()}
                          </span>
                        </div>

                        {showPrevBalance && (
                          <div className="w-full max-w-[200px] mt-2 pt-2 border-t border-border flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                              <span>Prev. Balance:</span>
                              <span>₹{prevBalance.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-xl font-black text-google-blue">
                              <span>NET:</span>
                              <span>₹{(invoice.total + prevBalance).toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Bottom Compact Info */}
            {(invoice.notes || (company.upiId && qrCodeUrl)) && (
              <div className="p-4 border-t border-border bg-surface-container-low/30 flex flex-col md:flex-row justify-between items-center gap-6">
                {invoice.notes && (
                  <div className="flex-1 max-w-sm">
                    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Notes</span>
                    <p className="text-[11px] font-bold text-foreground italic">"{invoice.notes}"</p>
                  </div>
                )}

                {company.upiId && qrCodeUrl && (
                  <div className="flex items-center gap-4 bg-surface p-2 rounded-2xl border border-border">
                    <img src={qrCodeUrl} alt="UPI QR" className="w-14 h-14" />
                    <div>
                      <span className="text-[8px] font-black text-google-blue uppercase tracking-widest block">Payment QR</span>
                      <p className="text-[10px] font-black text-foreground">{company.upiId}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Simplified Share Menu */}
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
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Share Options</p>
              </div>

              <button
                onClick={() => {
                  setShareWithPdf(true);
                  handleHeaderWhatsAppClick();
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
                  handleDownload();
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

      {/* Options Menu */}
      <AnimatePresence>
        {showOptions && (
          <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOptions(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="relative w-full max-w-sm bg-surface rounded-[40px] overflow-hidden"
            >
              <div className="p-8 space-y-2">
                <button onClick={() => { setShowPrevBalance(!showPrevBalance); setShowOptions(false); }} className="w-full p-6 text-left hover:bg-surface-container-high rounded-[32px] flex items-center gap-4 transition-colors">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${showPrevBalance ? 'bg-google-green text-white' : 'bg-surface-container-highest text-foreground'}`}>
                    <span className="text-lg font-black">₹</span>
                  </div>
                  <span className="font-black text-foreground">{showPrevBalance ? 'Hide' : 'Add'} Prev. Balance (Total Baaki)</span>
                </button>

                <button onClick={() => { alert("Attach Ledger feature coming soon!"); setShowOptions(false); }} className="w-full p-6 text-left hover:bg-surface-container-high rounded-[32px] flex items-center gap-4 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest text-foreground flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="font-black text-foreground">Attach Ledger (FY)</span>
                </button>

                <button onClick={() => {
                  setShowOptions(false);
                  handleHeaderWhatsAppClick();
                }} className="w-full p-6 text-left hover:bg-surface-container-high rounded-[32px] flex items-center gap-4 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest text-foreground flex items-center justify-center">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <span className="font-black text-foreground">Share</span>
                </button>

                <button onClick={() => { onEdit(invoice); setShowOptions(false); }} className="w-full p-6 text-left hover:bg-surface-container-high rounded-[32px] flex items-center gap-4 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-google-blue/10 text-google-blue flex items-center justify-center">
                    <Edit className="w-5 h-5" />
                  </div>
                  <span className="font-black text-foreground">Edit Invoice</span>
                </button>

                <button onClick={() => setShowDeleteConfirm(true)} className="w-full p-6 text-left hover:bg-google-red/10 rounded-[32px] flex items-center gap-4 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-google-red/10 text-google-red flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <span className="font-black text-google-red">Delete Invoice</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-surface p-12 rounded-[48px] shadow-2xl text-center max-w-sm"
            >
              <div className="w-20 h-20 bg-google-red/10 text-google-red rounded-full flex items-center justify-center mx-auto mb-8">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-foreground mb-4 font-heading tracking-tight">Are you sure?</h3>
              <p className="text-muted-foreground font-bold mb-10">This action will permanently delete this invoice and cannot be undone.</p>
              <div className="flex flex-col gap-3">
                <button onClick={handleDelete} className="w-full py-5 bg-google-red text-white rounded-full font-black uppercase tracking-widest text-xs shadow-lg shadow-google-red/20 transition-all hover:bg-red-600">Yes, Delete Invoice</button>
                <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-5 bg-surface-container-high text-foreground rounded-full font-black uppercase tracking-widest text-xs transition-colors hover:bg-surface-container-highest">Cancel</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* WhatsApp Modal */}
      <AnimatePresence>
        {showWhatsAppPhoneModal && (
          <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowWhatsAppPhoneModal(false);
                if (onClosePostSaveActions) onClosePostSaveActions();
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-surface rounded-t-[40px] md:rounded-[40px] p-8 md:p-10 shadow-google-lg z-[120] border border-border overflow-hidden"
            >
              <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-8 md:hidden" />

              <div className="flex items-center gap-5 mb-10">
                <div className="w-16 h-16 rounded-[24px] bg-google-green text-white flex items-center justify-center shadow-lg">
                  <MessageCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-3xl font-black font-heading text-foreground tracking-tight">Share Bill</h3>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-1">Send secure digital link</p>
                </div>
              </div>

              <div className="space-y-6 mb-12">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Customer Name</label>
                  <input
                    type="text"
                    value={waName}
                    onChange={(e) => setWaName(e.target.value)}
                    className="w-full p-5 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-lg font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30"
                    placeholder="Enter full name"
                    onFocus={() => {
                      if (StorageService.getContactPreference() === 'NOT_SET' && Capacitor.isNativePlatform()) {
                        setShowContactChoice(true);
                      }
                    }}
                  />
                </div>

                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">WhatsApp Number</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-google-blue font-black text-xl">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={waPhone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setWaPhone(val);

                        // Only search contacts when we have enough digits (debounced effect)
                        if (val.length >= 3) {
                          // Simple debounce using setTimeout
                          const timeoutId = setTimeout(async () => {
                            try {
                              const res = await ContactService.resolveName(val);
                              if (res.name) setWaName(res.name);

                              const results = await ContactService.getCombinedContacts(val);
                              setSuggestions(results);
                              setShowSuggestions(results.length > 0);
                            } catch (err) {
                              console.warn('Contact lookup failed:', err);
                            }
                          }, 300);
                          return () => clearTimeout(timeoutId);
                        } else {
                          setShowSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        if (StorageService.getContactPreference() === 'NOT_SET' && Capacitor.isNativePlatform()) {
                          setShowContactChoice(true);
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 300)}
                      className="w-full p-5 pl-16 pr-14 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-2xl font-black tracking-[0.1em] text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30"
                      placeholder="00000 00000"
                    />
                    <button
                      type="button"
                      onClick={handlePickContact}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-google-blue/10 flex items-center justify-center text-google-blue hover:bg-google-blue/20 transition-colors"
                    >
                      <Users className="w-5 h-5" />
                    </button>
                  </div>

                  {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute z-[130] left-0 right-0 top-full mt-3 bg-surface-container-highest border border-border rounded-[32px] shadow-google-lg max-h-56 overflow-y-auto p-2 backdrop-blur-2xl"
                    >
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setWaPhone(s.phone);
                            setWaName(s.name);
                            setShowSuggestions(false);
                          }}
                          className="w-full p-4 flex items-center gap-4 hover:bg-surface-container-high rounded-[20px] transition-all text-left group"
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${s.source === 'db' ? 'bg-google-blue text-white' : 'bg-google-green text-white'}`}>
                            {s.source === 'db' ? 'DB' : 'PH'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-black text-foreground truncate group-hover:text-google-blue transition-colors">{s.name}</div>
                            <div className="text-[10px] font-bold text-muted-foreground tracking-widest">{s.phone}</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3">

                {/* Share Options */}
                <div className="flex gap-3 mb-2">
                  <button
                    onClick={() => setShareWithPdf(!shareWithPdf)}
                    className={`flex-1 p-3 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${shareWithPdf ? 'border-google-blue bg-google-blue/10 text-google-blue font-bold' : 'border-border text-muted-foreground'}`}
                  >
                    <FileText className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Attach PDF</span>
                  </button>

                  {AIService.isConfigured() && (
                    <button
                      onClick={() => setShareTranslated(!shareTranslated)}
                      className={`flex-1 p-3 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${shareTranslated ? 'border-google-green bg-google-green/10 text-google-green font-bold' : 'border-border text-muted-foreground'}`}
                    >
                      <Languages className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Hinglish AI</span>
                    </button>
                  )}
                </div>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => sendWhatsApp(waPhone, waName)}
                  disabled={isTranslating}
                  className={`w-full py-5 bg-google-green text-white rounded-full font-black uppercase tracking-widest text-[11px] shadow-lg shadow-google-green/30 flex items-center justify-center gap-3 ${isTranslating ? 'opacity-70' : ''}`}
                >
                  {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                  {shareWithPdf ? 'Share PDF & Details' : 'Send WhatsApp Details'}
                </motion.button>

                <div className="flex flex-col gap-3">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setShowWhatsAppPhoneModal(false);
                      if (onClosePostSaveActions) onClosePostSaveActions();
                    }}
                    className="py-5 text-muted-foreground font-black uppercase tracking-widest text-[10px] hover:bg-surface-container rounded-full transition-colors"
                  >
                    Maybe Later
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ContactPermissionModal
        isOpen={showContactChoice}
        onClose={() => setShowContactChoice(false)}
        onChoice={onContactChoice}
      />
    </div>

  );
};

export default InvoiceView;
