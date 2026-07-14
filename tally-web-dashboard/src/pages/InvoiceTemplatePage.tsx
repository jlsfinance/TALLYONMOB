import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    Palette, Check, FileText, Columns, Save, Loader2, Upload,
    ArrowLeft, Share2, Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import toast from 'react-hot-toast';

const TEMPLATES = [
    {
        id: 'tally-classic',
        name: 'Tally Classic',
        desc: 'Traditional Tally double-border style',
        colors: { primary: '#000000', accent: '#f5f5f5', headerBg: '#ffffff', headerBorder: '#000000' },
        borderStyle: 'double',
        headerStyle: 'bordered',
    },
    {
        id: 'jls-professional',
        name: 'JLS Professional',
        desc: 'Clean colored header with modern layout',
        colors: { primary: '#1a56db', accent: '#dbeafe', headerBg: '#1a56db', headerBorder: '#1a56db' },
        borderStyle: 'single',
        headerStyle: 'filled',
    },
    {
        id: 'gst-invoice',
        name: 'GST Invoice',
        desc: 'GST-compliant format with tax grid',
        colors: { primary: '#047857', accent: '#d1fae5', headerBg: '#047857', headerBorder: '#047857' },
        borderStyle: 'single',
        headerStyle: 'filled',
    },
    {
        id: 'minimal',
        name: 'Minimal Clean',
        desc: 'Minimal design with subtle borders',
        colors: { primary: '#374151', accent: '#f3f4f6', headerBg: '#f9fafb', headerBorder: '#d1d5db' },
        borderStyle: 'thin',
        headerStyle: 'light',
    },
];

const FIELD_OPTIONS = [
    { key: 'showLogo', label: 'Company Logo', default: true },
    { key: 'showGST', label: 'GST Number', default: true },
    { key: 'showAddress', label: 'Company Address', default: true },
    { key: 'showPhone', label: 'Phone Number', default: true },
    { key: 'showEmail', label: 'Email Address', default: true },
    { key: 'showHSN', label: 'HSN/SAC Code', default: true },
    { key: 'showQR', label: 'Payment QR Code', default: false },
    { key: 'showTerms', label: 'Terms & Conditions', default: true },
    { key: 'showBank', label: 'Bank Details', default: true },
    { key: 'showSignature', label: 'Digital Signature', default: true },
    { key: 'showDiscount', label: 'Discount Column', default: true },
    { key: 'showNarration', label: 'Narration/Notes', default: true },
];

const DEFAULT_TERMS = '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is not made within due date.\n3. Subject to local jurisdiction.';

function loadSettings(companyId: string | undefined) {
    if (!companyId) return null;
    try {
        const raw = localStorage.getItem(`invoice_template_${companyId}`);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export default function InvoiceTemplatePage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [selectedTemplate, setSelectedTemplate] = useState('tally-classic');
    const [fieldToggles, setFieldToggles] = useState<Record<string, boolean>>(
        Object.fromEntries(FIELD_OPTIONS.map(f => [f.key, f.default]))
    );
    const [customColors, setCustomColors] = useState(TEMPLATES[0].colors);
    const [logoUrl, setLogoUrl] = useState('');
    const [termsText, setTermsText] = useState(DEFAULT_TERMS);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const saved = loadSettings(selectedCompany?.id);
        if (saved) {
            setSelectedTemplate(saved.template || 'tally-classic');
            setFieldToggles(saved.fields || Object.fromEntries(FIELD_OPTIONS.map(f => [f.key, f.default])));
            setCustomColors(saved.colors || TEMPLATES[0].colors);
            setLogoUrl(saved.logoUrl || '');
            setTermsText(saved.termsText || DEFAULT_TERMS);
        }
    }, [selectedCompany?.id]);

    const currentTemplate = TEMPLATES.find(t => t.id === selectedTemplate) || TEMPLATES[0];

    const toggleField = (key: string) => {
        setFieldToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const settings = {
                template: selectedTemplate,
                fields: fieldToggles,
                colors: customColors,
                logoUrl,
                termsText,
                companyId: selectedCompany?.id,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem(`invoice_template_${selectedCompany?.id}`, JSON.stringify(settings));
            toast.success('Invoice template saved!');
        } catch {
            toast.error('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handlePreviewInvoice = () => {
        navigate('/sales', { state: { previewTemplate: true } });
    };

    return (
        <div className="min-h-screen bg-[var(--background)] pb-24">
            <HeaderPortal type="title">
                <div className="flex items-center gap-2">
                    <Palette className="w-5 h-5 text-pink-400" />
                    <div>
                        <h1 className="text-sm md:text-lg font-bold text-[var(--on-surface)]">Invoice Templates</h1>
                        <p className="text-[10px] text-[var(--text-muted)]">Customize invoice appearance & fields</p>
                    </div>
                </div>
            </HeaderPortal>

            <div className="p-4 md:p-6 space-y-4">
                {/* Template Selection */}
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3">Choose Theme</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {TEMPLATES.map(tmpl => (
                            <button
                                key={tmpl.id}
                                onClick={() => { setSelectedTemplate(tmpl.id); setCustomColors(tmpl.colors); }}
                                className={`relative p-3 rounded-xl border-2 text-left transition-all ${selectedTemplate === tmpl.id
                                        ? 'border-pink-500 bg-pink-500/5'
                                        : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                                    }`}
                            >
                                {selectedTemplate === tmpl.id && (
                                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                )}
                                {/* Theme Preview */}
                                <div className={`w-full h-16 rounded-lg mb-2 border ${tmpl.borderStyle === 'double' ? 'border-[2px] border-black' :
                                        tmpl.borderStyle === 'thin' ? 'border border-gray-300' : 'border'
                                    }`} style={{
                                        borderColor: tmpl.colors.headerBorder,
                                        backgroundColor: tmpl.headerStyle === 'filled' ? tmpl.colors.headerBg :
                                            tmpl.headerStyle === 'light' ? tmpl.colors.accent : '#fff'
                                    }}>
                                    <div className={`h-4 rounded-t-[inherit] ${tmpl.headerStyle === 'filled' ? 'text-white' : ''}`}
                                        style={{
                                            backgroundColor: tmpl.headerStyle === 'filled' ? tmpl.colors.primary :
                                                tmpl.headerStyle === 'light' ? '#e5e7eb' : '#f3f4f6'
                                        }} />
                                    <div className="p-1 space-y-0.5">
                                        <div className="h-1 bg-gray-200 rounded w-3/4" />
                                        <div className="h-1 bg-gray-200 rounded w-1/2" />
                                    </div>
                                </div>
                                <h4 className="text-xs font-medium text-[var(--on-surface)]">{tmpl.name}</h4>
                                <p className="text-[10px] text-[var(--text-muted)]">{tmpl.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Color Customization */}
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                        <Palette className="w-4 h-4" /> Custom Colors
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Primary Color</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={customColors.primary}
                                    onChange={(e) => setCustomColors(prev => ({ ...prev, primary: e.target.value, headerBg: e.target.value }))}
                                    className="w-10 h-10 rounded-lg border border-[var(--border)] cursor-pointer"
                                />
                                <input type="text" value={customColors.primary}
                                    onChange={(e) => setCustomColors(prev => ({ ...prev, primary: e.target.value, headerBg: e.target.value }))}
                                    className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Accent Color</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={customColors.accent}
                                    onChange={(e) => setCustomColors(prev => ({ ...prev, accent: e.target.value }))}
                                    className="w-10 h-10 rounded-lg border border-[var(--border)] cursor-pointer"
                                />
                                <input type="text" value={customColors.accent}
                                    onChange={(e) => setCustomColors(prev => ({ ...prev, accent: e.target.value }))}
                                    className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Header Background</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={customColors.headerBg}
                                    onChange={(e) => setCustomColors(prev => ({ ...prev, headerBg: e.target.value }))}
                                    className="w-10 h-10 rounded-lg border border-[var(--border)] cursor-pointer"
                                />
                                <input type="text" value={customColors.headerBg}
                                    onChange={(e) => setCustomColors(prev => ({ ...prev, headerBg: e.target.value }))}
                                    className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Logo Upload */}
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                        <Upload className="w-4 h-4" /> Company Logo URL
                    </h3>
                    <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                    />
                </div>

                {/* Field Toggles */}
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                        <Columns className="w-4 h-4" /> Show/Hide Fields
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        {FIELD_OPTIONS.map(field => (
                            <label key={field.key} className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-[var(--background)] cursor-pointer">
                                <input type="checkbox" checked={fieldToggles[field.key]}
                                    onChange={() => toggleField(field.key)}
                                    className="w-4 h-4 rounded accent-pink-500"
                                />
                                <span className="text-sm text-[var(--on-surface)]">{field.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Terms & Conditions */}
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Terms & Conditions
                    </h3>
                    <textarea value={termsText} onChange={(e) => setTermsText(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] resize-none"
                    />
                </div>

                {/* Preview */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                    <h3 className="text-xs font-semibold text-gray-400 mb-2">PREVIEW</h3>
                    <InvoicePreview
                        template={currentTemplate}
                        colors={customColors}
                        fields={fieldToggles}
                        logoUrl={logoUrl}
                        termsText={termsText}
                        companyName={selectedCompany?.name || 'Company Name'}
                    />
                </div>

                {/* Save */}
                <button onClick={handleSave} disabled={saving}
                    className="w-full py-3 bg-pink-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-pink-600 disabled:opacity-50 transition-all">
                    {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <><Save className="w-5 h-5" /> Save Template</>}
                </button>
            </div>
        </div>
    );
}

function InvoicePreview({ template, colors, fields, logoUrl, termsText, companyName }: any) {
    return (
        <div className={`border text-[9px] leading-tight ${template.borderStyle === 'double' ? 'border-[2px] border-black' :
                template.borderStyle === 'thin' ? 'border border-gray-300' : 'border'
            }`}
            style={{ borderColor: template.colors.headerBorder }}
        >
            {/* Header */}
            <div className={`${template.headerStyle === 'filled' ? 'text-white' : 'text-gray-800'}`}
                style={{
                    backgroundColor: template.headerStyle === 'filled' ? colors.primary :
                        template.headerStyle === 'light' ? '#f9fafb' : '#fff'
                }}>
                <div className={`p-2 border-b ${template.borderStyle === 'double' ? 'border-b-[2px] border-black' : 'border-gray-200'}`}
                    style={{ borderColor: template.headerStyle === 'filled' ? colors.headerBorder : '#e5e7eb' }}>
                    <div className="flex justify-between items-start">
                        <div>
                            {fields.showLogo && logoUrl && <img src={logoUrl} alt="Logo" className="h-6 mb-1" />}
                            {fields.showLogo && !logoUrl && <div className="w-6 h-6 bg-gray-200 rounded mb-1 flex items-center justify-center text-[6px] text-gray-400">LOGO</div>}
                            <p className="font-bold text-[10px]">{companyName}</p>
                            {fields.showAddress && <p>123, Business Street, City - 400001</p>}
                            {fields.showGST && <p>GSTIN: 27AABCU9603R1ZM</p>}
                            {fields.showPhone && <p>Ph: +91 98765 43210</p>}
                            {fields.showEmail && <p>Email: info@company.com</p>}
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-[10px]">TAX INVOICE</p>
                            <p>Invoice No: INV-001</p>
                            <p>Date: {new Date().toLocaleDateString('en-IN')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Buyer */}
            <div className="p-1 border-b border-gray-200 bg-gray-50">
                <p className="font-bold">Buyer: Customer Name</p>
                <p>GSTIN: 27BBBBB9603R1ZM | State: Maharashtra</p>
            </div>

            {/* Items Table */}
            <div className="border-b border-gray-200">
                <div className="grid grid-cols-5 text-center font-bold bg-gray-100 border-b border-gray-200 text-[8px]">
                    <div className="p-1 border-r border-gray-200">#</div>
                    <div className="p-1 border-r border-gray-200 text-left">Item</div>
                    {fields.showHSN && <div className="p-1 border-r border-gray-200">HSN</div>}
                    <div className="p-1 border-r border-gray-200">Qty</div>
                    <div className="p-1 text-right">Amount</div>
                </div>
                <div className="grid grid-cols-5 text-center text-[8px] border-b border-gray-100">
                    <div className="p-1 border-r border-gray-200">1</div>
                    <div className="p-1 border-r border-gray-200 text-left">Sample Item</div>
                    {fields.showHSN && <div className="p-1 border-r border-gray-200">8471</div>}
                    <div className="p-1 border-r border-gray-200">10</div>
                    <div className="p-1 text-right">₹5,000</div>
                </div>
            </div>

            {/* Totals */}
            <div className="p-1 border-b border-gray-200 text-right text-[8px] space-y-0.5">
                <p>Subtotal: ₹5,000.00</p>
                <p>CGST (9%): ₹450.00</p>
                <p>SGST (9%): ₹450.00</p>
                <p className="font-bold text-[10px]">Grand Total: ₹5,900.00</p>
            </div>

            {/* Bank & Terms */}
            <div className="grid grid-cols-2 text-[8px] border-t border-gray-200">
                {fields.showBank && (
                    <div className="p-1 border-r border-gray-200">
                        <p className="font-bold underline">Bank Details:</p>
                        <p>SBI | A/C: 12345678</p>
                        <p>IFSC: SBIN0001234</p>
                    </div>
                )}
                {fields.showTerms && (
                    <div className="p-1">
                        <p className="font-bold underline">Terms:</p>
                        <p>{termsText.split('\n')[0]}</p>
                    </div>
                )}
            </div>

            {/* Signature */}
            {fields.showSignature && (
                <div className="p-1 text-right text-[8px] border-t border-gray-200">
                    <p>for {companyName}</p>
                    <p className="border-t border-gray-400 inline-block px-6 mt-2">Authorized Signatory</p>
                </div>
            )}
        </div>
    );
}
