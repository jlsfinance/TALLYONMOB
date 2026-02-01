import React, { useState, useEffect } from 'react';
import { Upload, AlertCircle, Loader2, Download, Sparkles, Eye, X, Check, Send, Paperclip, Bot, ArrowLeft, Package, Users } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { AIService } from '../services/aiService';
import { Product, Customer } from '../types';
import { useCompany } from '@/contexts/CompanyContext';
import { useAI as useAIContext } from '@/contexts/AIContext';
import VoiceInput from './VoiceInput';
import * as XLSX from 'xlsx';

// Chat Message Type
interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  attachment?: { name: string; type: string };
}

interface ImportProps {
  onClose: () => void;
  onImportComplete: () => void;
  startWithAI?: boolean;
}

type ImportStep = 'MODE_SELECT' | 'UPLOAD' | 'PREVIEW';

const Import: React.FC<ImportProps> = ({ onClose, onImportComplete, startWithAI = false }) => {
  useCompany(); // Keep hook call for potential future use
  const { showKeySetup, isConfigured: isAIConfigured } = useAIContext();
  const [loading, setLoading] = useState(false);
  const [useAI, setUseAI] = useState(false); // Whether to use AI parsing
  const [showAIChat, setShowAIChat] = useState(startWithAI); // Whether to show full-screen AI chat
  const [step, setStep] = useState<ImportStep>(startWithAI ? 'UPLOAD' : 'MODE_SELECT');
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  const [previewData, setPreviewData] = useState<{ products: Product[], customers: Customer[] } | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', text: `Hi! I'm JLS Assistant 🤖\nI can help you manage your business.\n\nTry asking:\n"Show me full year ledger"\n"Kitna baaki hai?"\n"Today's sales report"`, sender: 'ai', timestamp: new Date() }
  ]);
  const [inputText, setInputText] = useState('');
  const [dynamicSuggestions, setDynamicSuggestions] = useState<{ label: string; query: string }[]>([]);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Generate context-aware suggestions based on user's last message
  const generateSuggestions = (lastUserMessage: string): { label: string; query: string }[] => {
    const lower = lastUserMessage.toLowerCase();

    // Sales related
    if (lower.includes('sale') || lower.includes('bech') || lower.includes('bikri') || lower.includes('revenue')) {
      return [
        { label: '📅 Week ka sales', query: 'Show this week sales' },
        { label: '📊 Month report', query: 'This month sales report' },
        { label: '💰 Pending payments', query: 'Kitna baaki hai?' },
        { label: '📋 Full year ledger', query: 'Show full financial year ledger' }
      ];
    }

    // Pending/Balance related
    if (lower.includes('pending') || lower.includes('baaki') || lower.includes('udhar') || lower.includes('balance') || lower.includes('lena')) {
      return [
        { label: '👤 Customer wise', query: 'Customer wise pending list' },
        { label: '📞 Contact details', query: 'Pending customers with phone' },
        { label: '📊 Overdue amount', query: 'Show oldest pending bills' },
        { label: '📋 Full ledger', query: 'Show full financial year ledger' }
      ];
    }

    // Stock/Inventory related
    if (lower.includes('stock') || lower.includes('inventory') || lower.includes('maal') || lower.includes('godown')) {
      return [
        { label: '⚠️ Low stock', query: 'Show low stock items' },
        { label: '💰 Stock value', query: 'Total inventory value' },
        { label: '📦 Category wise', query: 'Stock by category' },
        { label: '📊 Sales report', query: 'Show today sales' }
      ];
    }

    // Customer related
    if (lower.includes('customer') || lower.includes('grahak') || lower.includes('party')) {
      return [
        { label: '💰 Pending bal', query: 'Customers with pending balance' },
        { label: '🏆 Top customers', query: 'Top 10 customers by purchase' },
        { label: '📋 Ledger', query: 'Show full financial year ledger' },
        { label: '📊 Sales report', query: 'Show today sales' }
      ];
    }

    // Ledger/Report related
    if (lower.includes('ledger') || lower.includes('report') || lower.includes('hisab') || lower.includes('summary')) {
      return [
        { label: '📅 Monthly', query: 'Show this month report' },
        { label: '💰 Receivables', query: 'Total pending amount' },
        { label: '📦 Stock value', query: 'Total inventory value' },
        { label: '👥 Customer list', query: 'All customers' }
      ];
    }

    // Default suggestions
    return [
      { label: '📊 Today sales', query: 'Show today sales' },
      { label: '💰 Pending', query: 'Kitna baaki hai?' },
      { label: '📦 Stock', query: 'Stock report' },
      { label: '📋 Full ledger', query: 'Show full financial year ledger' }
    ];
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, useAI]);

  // Parse Excel File
  const parseExcelFile = async (file: File) => {
    // 1. File Size Limit (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setStatus({ type: 'error', message: 'File size too large. Maximum limit is 2MB.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        const products: Product[] = [];
        const customers: Customer[] = [];

        const pSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('product')) || workbook.SheetNames[0];
        const pSheet = workbook.Sheets[pSheetName];
        const pData = XLSX.utils.sheet_to_json(pSheet);

        // 2. Row Count Limit (1000 rows)
        if (pData.length > 1000) {
          throw new Error("Too many products. Maximum limit is 1000 rows per sheet.");
        }

        pData.forEach((row: any) => {
          if (row.Name && row.Price) {
            products.push({
              id: row.ID || crypto.randomUUID(),
              name: row.Name,
              price: Number(row.Price) || 0,
              stock: Number(row.Stock) || 0,
              category: row.Category || 'General',
              gstRate: Number(row.GST) || 0,
              description: row.Description || ''
            });
          }
        });

        const cSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('customer'));
        if (cSheetName) {
          const cSheet = workbook.Sheets[cSheetName];
          const cData = XLSX.utils.sheet_to_json(cSheet);

          // 2. Row Count Limit (1000 rows)
          if (cData.length > 1000) {
            throw new Error("Too many customers. Maximum limit is 1000 rows per sheet.");
          }

          cData.forEach((row: any) => {
            if (row.Name) {
              customers.push({
                id: crypto.randomUUID(),
                name: row.Name,
                phone: row.Phone ? String(row.Phone) : '',
                email: row.Email || '',
                address: row.Address || '',
                balance: Number(row.Balance) || 0,
                company: row.Company || '',
                gstin: row.GSTIN || '',
                notifications: []
              });
            }
          });
        }

        if (products.length === 0 && customers.length === 0) {
          throw new Error("No valid data found. Check column names: Name, Price, Stock etc.");
        }

        setPreviewData({ products, customers });
        setStep('PREVIEW');
        setLoading(false);

        if (useAI) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            text: `✅ Found ${products.length} products and ${customers.length} customers.\nReview below and click "Confirm Import" to add them.`,
            sender: 'ai',
            timestamp: new Date()
          }]);
        }

      } catch (err: any) {
        console.error(err);
        setStatus({ type: 'error', message: err.message || 'Failed to parse file' });
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Tally XML Parser
  const parseTallyXML = async (file: File) => {
    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');

      const products: Product[] = [];
      const customers: Customer[] = [];

      // Parse STOCKITEM nodes
      const stockItems = xmlDoc.querySelectorAll('STOCKITEM');
      stockItems.forEach((item) => {
        const name = item.getAttribute('NAME') || item.querySelector('NAME')?.textContent;
        const rate = item.querySelector('OPENINGRATE, RATE')?.textContent || '0';
        const qty = item.querySelector('OPENINGBALANCE, CLOSINGBALANCE')?.textContent || '0';

        if (name) {
          products.push({
            id: crypto.randomUUID(),
            name: name.trim(),
            price: parseFloat(rate.replace(/[^\d.-]/g, '')) || 0,
            stock: parseFloat(qty.replace(/[^\d.-]/g, '')) || 0,
            category: 'Tally Import',
            gstRate: 0
          });
        }
      });

      // Parse LEDGER nodes (Customers/Vendors)
      const ledgers = xmlDoc.querySelectorAll('LEDGER');
      ledgers.forEach((ledger) => {
        const name = ledger.getAttribute('NAME') || ledger.querySelector('NAME')?.textContent;
        const parent = ledger.querySelector('PARENT')?.textContent?.toLowerCase() || '';
        const address = ledger.querySelector('ADDRESS')?.textContent || '';
        const gstin = ledger.querySelector('PARTYGSTIN, GSTIN')?.textContent || '';
        const balance = ledger.querySelector('CLOSINGBALANCE, OPENINGBALANCE')?.textContent || '0';

        // Only import Sundry Debtors (Customers) or Sundry Creditors (Vendors)
        if (name && (parent.includes('sundry debtor') || parent.includes('sundry creditor'))) {
          customers.push({
            id: crypto.randomUUID(),
            name: name.trim(),
            phone: '',
            email: '',
            address: address.trim(),
            balance: parseFloat(balance.replace(/[^\d.-]/g, '')) || 0,
            company: '',
            gstin: gstin.trim(),
            notifications: []
          });
        }
      });

      if (products.length === 0 && customers.length === 0) {
        throw new Error("No valid Tally data found. Ensure the XML contains STOCKITEM or LEDGER tags.");
      }

      setPreviewData({ products, customers });
      setStep('PREVIEW');
      setLoading(false);

      if (useAI) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: `📋 Tally XML Imported!\nFound ${products.length} products and ${customers.length} customers.\nReview and click "Confirm Import" to add.`,
          sender: 'ai',
          timestamp: new Date()
        }]);
      }

    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: err.message || 'Failed to parse Tally XML' });
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // Reset file input

    // Use XML parser for Tally files
    if (file.name.endsWith('.xml')) {
      parseTallyXML(file);
      return;
    }

    // Smart AI Import mode - use Gemini for intelligent parsing
    if (useAI) {
      if (!isAIConfigured) {
        showKeySetup("Smart AI Import");
        return;
      }
      setLoading(true);
      setStatus({ type: 'idle', message: '' });
      try {
        let fileContent: string;

        // Handle PDF files
        if (file.name.toLowerCase().endsWith('.pdf')) {
          fileContent = await AIService.pdfToText(file);
        } else {
          // Handle Excel files
          fileContent = await AIService.excelToText(file);
        }

        // Fail fast if no text found (e.g. scanned PDF)
        if (fileContent.includes('No text content found in PDF')) {
          throw new Error('This PDF appears to be empty or scanned (image-only). Please use a text-based PDF or Convert it to Excel.');
        }

        const result = await AIService.extractFromExcel(fileContent, file.name);

        if (result.products.length === 0 && result.customers.length === 0) {
          const preview = fileContent.substring(0, 300).replace(/\n/g, ' ');
          throw new Error(`AI could not extract any data. Please check if the file has valid text.\n\nExtracted Text Preview: "${preview}..."`);
        }

        setPreviewData({ products: result.products, customers: result.customers });
        setStep('PREVIEW');
        setLoading(false);

        if (showAIChat) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            text: `✅ AI Extracted from ${file.name.endsWith('.pdf') ? 'PDF' : 'Excel'}:\n• ${result.products.length} products\n• ${result.customers.length} customers\n\nReview and click "Confirm Import" to add.`,
            sender: 'ai',
            timestamp: new Date()
          }]);
        }
      } catch (err: any) {
        console.error('AI parsing error:', err);
        setStatus({ type: 'error', message: err.message || 'AI parsing failed. Please check your API key or try Normal Import.' });
        setLoading(false);
      }
      return;
    }

    // Normal Import mode OR AI not configured - use strict column-based parsing
    parseExcelFile(file);
  };

  const handleDownloadSample = () => {
    const wb = XLSX.utils.book_new();
    const pWs = XLSX.utils.json_to_sheet([
      { ID: 'P001', Name: 'iPhone 15', Price: 79999, Stock: 10, Category: 'Electronics', GST: 18 },
      { ID: 'P002', Name: 'Samsung S24', Price: 89999, Stock: 5, Category: 'Electronics', GST: 18 }
    ]);
    XLSX.utils.book_append_sheet(wb, pWs, "Products");
    const cWs = XLSX.utils.json_to_sheet([
      { Name: 'John Doe', Phone: '9876543210', Balance: 500, Address: 'Mumbai', GSTIN: '27ABCDE1234F1Z5' }
    ]);
    XLSX.utils.book_append_sheet(wb, cWs, "Customers");
    XLSX.writeFile(wb, "JLS_Import_Sample.xlsx");
  };

  const handleConfirmImport = async () => {
    if (!previewData) return;
    setLoading(true);

    try {
      let pCount = 0, cCount = 0;

      for (const p of previewData.products) {
        StorageService.saveProduct(p);
        pCount++;
      }
      for (const c of previewData.customers) {
        StorageService.saveCustomer(c);
        cCount++;
      }

      setStatus({ type: 'success', message: `Successfully imported ${pCount} products and ${cCount} customers!` });

      setTimeout(() => {
        onImportComplete();
        if (!useAI) onClose();
        else {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            text: `✅ Imported ${pCount} products and ${cCount} customers successfully!`,
            sender: 'ai',
            timestamp: new Date()
          }]);
          setPreviewData(null);
          setStep('UPLOAD');
        }
        setLoading(false);
      }, 1000);

    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Import failed while saving data.' });
      setLoading(false);
    }
  };

  const handleCancelPreview = () => {
    setPreviewData(null);
    setStep(useAI ? 'UPLOAD' : 'MODE_SELECT');
    setStatus({ type: 'idle', message: '' });
  };

  const [isVoiceMode, setIsVoiceMode] = useState(false);

  // Text-to-Speech Function
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      // Strip emojis/markdown for cleaner speech
      const cleanText = text.replace(/[*#]/g, '').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'hi-IN'; // Prefer Hindi/Indian accent
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSendMessage = async (isAutoVoice: boolean = false) => {
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    };

    // Prepare history for API (exclude current message as it's added below)
    // Filter out initial system message if needed, or keeping it is fine
    const history = messages
      .filter(m => m.id !== '1') // content-wise filter if needed
      .map(m => ({ sender: m.sender, text: m.text }));

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      if (!isAIConfigured) {
        setLoading(false);
        showKeySetup("JLS Assistant Chat");
        return;
      }
      // Gather real business data
      const products = StorageService.getProducts();
      const customers = StorageService.getCustomers();
      const invoices = StorageService.getInvoices();
      const payments = StorageService.getPayments() || [];
      const today = new Date().toISOString().split('T')[0];

      // Calculate financial year start (April 1st)
      const now = new Date();
      const fyStart = now.getMonth() >= 3 ? new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1);
      const fyStartStr = fyStart.toISOString().split('T')[0];

      // Filter for this financial year
      const fyInvoices = invoices.filter(i => i.date >= fyStartStr);
      const fyPayments = payments.filter((p: any) => p.date >= fyStartStr);

      const businessContext = {
        products: products.map(p => ({ name: p.name, price: p.price, stock: p.stock })),
        customers: customers.map(c => ({
          name: c.name,
          balance: c.balance,
          phone: c.phone,
          openingBalance: (c as any).openingBalance || 0
        })),
        invoices: invoices.map(i => ({ customerName: i.customerName, total: i.total, status: i.status, date: i.date })),
        payments: payments.map((p: any) => ({
          customerName: customers.find(c => c.id === p.customerId)?.name || 'Unknown',
          amount: p.amount,
          date: p.date,
          mode: p.mode
        })),
        todaySales: invoices.filter(i => i.date === today).reduce((sum, i) => sum + i.total, 0),
        totalReceivables: customers.reduce((sum, c) => sum + c.balance, 0),
        totalInventoryValue: products.reduce((sum, p) => sum + (p.price * p.stock), 0),
        financialYearStart: `April ${fyStart.getFullYear()}`,
        totalSalesThisYear: fyInvoices.reduce((sum, i) => sum + i.total, 0),
        totalCollectionsThisYear: fyPayments.reduce((sum: number, p: any) => sum + p.amount, 0),
      };

      // Use AI service for intelligent response with HISTORY
      const aiText = await AIService.chat(userMsg.text, businessContext, history);

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: aiText,
        sender: 'ai',
        timestamp: new Date()
      }]);

      // Speak result if in voice mode
      if (isAutoVoice || isVoiceMode) {
        speak(aiText);
        setIsVoiceMode(false); // Reset after speaking
      }

      // Generate context-aware follow-up suggestions
      setDynamicSuggestions(generateSuggestions(userMsg.text));
      setLoading(false);

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      }]);
      setLoading(false);
    }
  };

  // ============== AI FULL SCREEN CHAT ==============
  if (showAIChat) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom duration-300 pt-safe">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">JLS Assistant</h1>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs text-slate-500 font-medium">Online • Smart AI</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${msg.sender === 'user'
                ? 'bg-indigo-600 text-white rounded-br-none'
                : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'
                }`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl px-4 py-3 border border-slate-100 rounded-bl-none flex items-center gap-2 shadow-sm">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Dynamic Follow-up Suggestions */}
        {!previewData && !loading && (
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
            {(dynamicSuggestions.length > 0 ? dynamicSuggestions : [
              { label: '📊 Today Sales', query: 'Show today sales' },
              { label: '💰 Pending', query: 'Kitna baaki hai?' },
              { label: '📋 Full Ledger', query: 'Show full financial year ledger' },
              { label: '📦 Stock', query: 'Stock report' }
            ]).map((suggestion, i) => (
              <button
                key={i}
                onClick={() => {
                  setInputText(suggestion.query);
                  // Auto-send after setting
                  setTimeout(() => {
                    const input = document.querySelector('input[placeholder="Ask JLS AI..."]') as HTMLInputElement;
                    if (input) {
                      input.focus();
                    }
                  }, 100);
                }}
                className="px-4 py-2 rounded-full text-xs font-bold border whitespace-nowrap active:scale-95 transition-transform bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="p-3 bg-white border-t border-slate-200 shrink-0">
          <input
            id="ai-file-upload"
            type="file"
            accept=".xlsx,.xls,.xml,.pdf"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Preview Card in Chat */}
          {previewData && (
            <div className="mb-3 mx-1 bg-white border border-slate-200 shadow-lg rounded-xl overflow-hidden animate-in slide-in-from-bottom-10">
              <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 flex justify-between items-center">
                <span className="text-xs font-bold text-indigo-700">📄 File Analyzed</span>
                <span className="text-[10px] bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">
                  {previewData.products.length} Products • {previewData.customers.length} Customers
                </span>
              </div>
              <div className="p-3 max-h-48 overflow-y-auto">
                {previewData.products.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Products</p>
                    <div className="space-y-1">
                      {previewData.products.slice(0, 5).map((p, i) => (
                        <div key={i} className="flex justify-between text-xs bg-slate-50 px-2 py-1 rounded">
                          <span className="text-slate-700 truncate">{p.name}</span>
                          <span className="text-green-600 font-bold">₹{p.price}</span>
                        </div>
                      ))}
                      {previewData.products.length > 5 && (
                        <p className="text-[10px] text-slate-400 text-center">+{previewData.products.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={handleConfirmImport} disabled={loading} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-xs font-bold disabled:opacity-50">
                    {loading ? 'Importing...' : 'Confirm Import'}
                  </button>
                  <button onClick={handleCancelPreview} className="px-4 bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-bold">Discard</button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            <button onClick={() => { setShowAIChat(false); setStep('MODE_SELECT'); }} className="p-3 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors" title="Exit AI Mode">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={() => document.getElementById('ai-file-upload')?.click()} className="p-3 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
              <Paperclip className="w-5 h-5" />
            </button>
            <div className="flex-1 bg-slate-100 rounded-[24px] px-4 py-2 flex items-center border-2 border-transparent focus-within:border-indigo-500 focus-within:bg-white transition-all">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask JLS AI..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 placeholder:text-slate-400"
              />
              <VoiceInput
                onItemsParsed={(parsedItems) => {
                  // Not used here, but needed for type compatibility
                  console.log(parsedItems);
                }}
                onTranscript={(text) => {
                  setInputText(text);
                  setIsVoiceMode(true);
                  // Allow state to update then send
                  setTimeout(() => handleSendMessage(true), 100);
                }}
                compact={true}
              />
            </div>
            <button onClick={() => handleSendMessage(false)} disabled={!inputText.trim()} className="p-3 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all">
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============== NORMAL MODAL MODE ==============
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
          <h2 className="text-xl font-bold">Import Data</h2>
          <p className="text-blue-100 text-sm mt-1">
            {step === 'MODE_SELECT' && 'Choose how you want to import'}
            {step === 'UPLOAD' && 'Upload your file'}
            {step === 'PREVIEW' && 'Review before adding'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* STEP 1: Mode Selection */}
          {step === 'MODE_SELECT' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setStep('UPLOAD')}
                  className="flex flex-col items-center gap-3 p-6 bg-slate-50 hover:bg-blue-50 border-2 border-slate-200 hover:border-blue-400 rounded-xl transition-all group"
                >
                  <div className="w-14 h-14 bg-blue-100 group-hover:bg-blue-200 rounded-full flex items-center justify-center transition-colors">
                    <Upload className="w-7 h-7 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-800">Normal Import</p>
                    <p className="text-xs text-slate-500 mt-1">Excel / Tally XML</p>
                  </div>
                </button>

                <button
                  onClick={() => { setUseAI(true); setStep('UPLOAD'); }}
                  className="flex flex-col items-center gap-3 p-6 bg-gradient-to-br from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 border-2 border-purple-200 hover:border-purple-400 rounded-xl transition-all group"
                >
                  <div className="w-14 h-14 bg-gradient-to-tr from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                    <Sparkles className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-800">Smart AI Import</p>
                    <p className="text-xs text-slate-500 mt-1">Powered by Gemini</p>
                  </div>
                </button>
              </div>

              <button onClick={handleDownloadSample} className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition-colors text-sm">
                <Download className="w-4 h-4" /> Download Sample Excel
              </button>
            </>
          )}

          {/* STEP 2: Upload */}
          {step === 'UPLOAD' && !previewData && (
            <>
              <div className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-xl p-8 text-center transition-colors bg-blue-50/50">
                <label className="cursor-pointer flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-blue-500" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-700 block">Click to upload or drag and drop</span>
                    <span className="text-xs text-slate-500">{useAI ? '.xlsx, .xls, .xml, .pdf' : '.xlsx, .xls, .xml (Tally)'}</span>
                  </div>
                  <input type="file" accept={useAI ? ".xlsx,.xls,.xml,.pdf" : ".xlsx,.xls,.xml"} onChange={handleFileUpload} disabled={loading} className="hidden" />
                </label>
              </div>

              {status.type === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" /> {status.message}
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  <span className="text-sm text-slate-600">Processing file...</span>
                </div>
              )}

              <button onClick={() => setStep('MODE_SELECT')} className="w-full py-2.5 border border-slate-300 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition-colors text-sm">
                ← Back to Mode Selection
              </button>
            </>
          )}

          {/* STEP 3: Preview */}
          {step === 'PREVIEW' && previewData && (
            <>
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Eye className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-bold text-blue-900">Preview - Review before adding</span>
              </div>

              {/* Products */}
              {previewData.products.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2.5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-bold text-slate-700">Products</span>
                    </div>
                    <span className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-full font-bold">{previewData.products.length}</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                    {previewData.products.map((p, i) => (
                      <div key={i} className="px-4 py-2.5 flex justify-between items-center hover:bg-slate-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                          <p className="text-xs text-slate-500">Stock: {p.stock} | {p.category}</p>
                        </div>
                        <span className="text-sm font-bold text-green-600 ml-2">₹{p.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customers */}
              {previewData.customers.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2.5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-bold text-slate-700">Customers</span>
                    </div>
                    <span className="text-xs bg-purple-600 text-white px-2.5 py-1 rounded-full font-bold">{previewData.customers.length}</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                    {previewData.customers.map((c, i) => (
                      <div key={i} className="px-4 py-2.5 hover:bg-slate-50">
                        <p className="text-sm font-medium text-slate-800">{c.name}</p>
                        {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button onClick={handleCancelPreview} className="flex-1 px-4 py-3 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button onClick={handleConfirmImport} disabled={loading} className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-500/30 flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {loading ? 'Adding...' : 'Add All'}
                </button>
              </div>
            </>
          )}

          {/* Success Message */}
          {status.type === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm flex items-center gap-2">
              <Check className="w-5 h-5" /> {status.message}
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'PREVIEW' && (
          <div className="px-6 pb-6">
            <button onClick={onClose} className="w-full py-2.5 border border-slate-300 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition-colors text-sm">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Import;
