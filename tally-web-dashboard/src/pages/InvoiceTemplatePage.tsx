import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    Palette, Check, Eye, Upload, Image, Type, Columns,
    FileText, Download, ChevronRight, Loader2, Save
} from 'lucide-react';
import toast from 'react-hot-toast';

const TEMPLATES = [
    {
        id: 'classic',
        name: 'Classic Professional',
        desc: 'Clean layout with header border',
        colors: { primary: '#1a56db', accent: '#e5e7eb', text: '#111827' },
        preview: 'border-t-4 border-blue-600'
    },
    {
        id: 'modern',
        name: 'Modern Minimal',
        desc: 'Sleek minimal design',
        colors: { primary: '#059669', accent: '#f0fdf4', text: '#064e3b' },
        preview: 'border-l-4 border-emerald-500'
    },
    {
        id: 'bold',
        name: 'Bold & Dark',
        desc: 'Dark header with contrast',
        colors: { primary: '#7c3aed', accent: '#f5f3ff', text: '#4c1d95' },
        preview: 'bg-violet-900 text-white'
    },
    {
        id: 'corporate',
        name: 'Corporate Blue',
        desc: 'Enterprise style layout',
        colors: { primary: '#1e40af', accent: '#dbeafe', text: '#1e3a5f' },
        preview: 'border-b-4 border-blue-800'
    },
    {
        id: 'warm',
        name: 'Warm & Friendly',
        desc: 'Orange accents, approachable',
        colors: { primary: '#ea580c', accent: '#fff7ed', text: '#9a3412' },
        preview: 'border-t-4 border-orange-500'
    },
    {
        id: 'elegant',
        name: 'Elegant Gold',
        desc: 'Premium gold theme',
        colors: { primary: '#b45309', accent: '#fffbeb', text: '#78350f' },
        preview: 'border-l-4 border-amber-600'
    }
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
    { key: 'showSignature', label: 'Digital Signature', default: false },
    { key: 'showDiscount', label: 'Discount Column', default: true },
    { key: 'showNarration', label: 'Narration/Notes', default: true },
];

export default function InvoiceTemplatePage() {
    const { selectedCompany } = useAuth() as any;
    const [selectedTemplate, setSelectedTemplate] = useState('classic');
    const [fieldToggles, setFieldToggles] = useState<Record<string, boolean>>(
        Object.fromEntries(FIELD_OPTIONS.map(f => [f.key, f.default]))
    );
    const [customColors, setCustomColors] = useState({ primary: '#1a56db', accent: '#e5e7eb' });
    const [logoUrl, setLogoUrl] = useState('');
    const [termsText, setTermsText] = useState('1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is not made within due date.\n3. Subject to local jurisdiction.');
    const [saving, setSaving] = useState(false);

    const currentTemplate = TEMPLATES.find(t => t.id === selectedTemplate) || TEMPLATES[0];

    const toggleField = (key: string) => {
        setFieldToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Save to localStorage for now (can be moved to Supabase)
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
            toast.success('Template saved successfully!');
        } catch {
            toast.error('Failed to save template');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                    <Palette className="w-6 h-6 text-pink-400" />
                    Invoice Templates
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Customize how your invoices look</p>
            </div>

            {/* Template Selection */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3">Choose Template</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {TEMPLATES.map(tmpl => (
                        <button
                            key={tmpl.id}
                            onClick={() => { setSelectedTemplate(tmpl.id); setCustomColors(tmpl.colors); }}
                            className={`relative p-4 rounded-xl border-2 text-left transition-all ${selectedTemplate === tmpl.id
                                    ? 'border-pink-500 bg-pink-500/5'
                                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                                }`}
                        >
                            {selectedTemplate === tmpl.id && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                                    <Check className="w-3 h-3 text-white" />
                                </div>
                            )}
                            <div className={`w-full h-12 rounded-lg mb-2 ${tmpl.preview}`}
                                style={{ backgroundColor: tmpl.colors.accent }}>
                            </div>
                            <h4 className="text-sm font-medium text-[var(--on-surface)]">{tmpl.name}</h4>
                            <p className="text-xs text-[var(--text-muted)]">{tmpl.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Color Customization */}
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 mb-4">
                <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                    <Palette className="w-4 h-4" /> Custom Colors
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-[var(--text-muted)] mb-1 block">Primary Color</label>
                        <div className="flex items-center gap-2">
                            <input type="color" value={customColors.primary}
                                onChange={(e) => setCustomColors(prev => ({ ...prev, primary: e.target.value }))}
                                className="w-10 h-10 rounded-lg border border-[var(--border)] cursor-pointer"
                            />
                            <input type="text" value={customColors.primary}
                                onChange={(e) => setCustomColors(prev => ({ ...prev, primary: e.target.value }))}
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
                </div>
            </div>

            {/* Field Toggles */}
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 mb-4">
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
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 mb-4">
                <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Terms & Conditions
                </h3>
                <textarea value={termsText} onChange={(e) => setTermsText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] resize-none"
                />
            </div>

            {/* Invoice Preview */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">📄 Preview</h3>
                <div className={`border rounded-lg p-4 ${currentTemplate.preview}`} style={{ borderColor: customColors.primary }}>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            {fieldToggles.showLogo && <div className="w-12 h-12 bg-gray-200 rounded-lg mb-2 flex items-center justify-center text-xs text-gray-400">LOGO</div>}
                            <h2 className="text-lg font-bold" style={{ color: customColors.primary }}>{selectedCompany?.name || 'Company Name'}</h2>
                            {fieldToggles.showAddress && <p className="text-xs text-gray-500">123, Business Street, City</p>}
                            {fieldToggles.showGST && <p className="text-xs text-gray-500">GSTIN: 27AABCU9603R1Z2</p>}
                        </div>
                        <div className="text-right">
                            <h3 className="text-base font-bold" style={{ color: customColors.primary }}>TAX INVOICE</h3>
                            <p className="text-xs text-gray-500">No: INV-001</p>
                            <p className="text-xs text-gray-500">Date: {new Date().toLocaleDateString('en-IN')}</p>
                        </div>
                    </div>

                    <table className="w-full text-xs mb-3">
                        <thead>
                            <tr style={{ backgroundColor: customColors.accent }}>
                                <th className="text-left p-2 border">Item</th>
                                {fieldToggles.showHSN && <th className="p-2 border">HSN</th>}
                                <th className="p-2 border">Qty</th>
                                <th className="p-2 border">Rate</th>
                                <th className="text-right p-2 border">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="p-2 border text-gray-700">Sample Item</td>
                                {fieldToggles.showHSN && <td className="p-2 border text-center text-gray-500">8471</td>}
                                <td className="p-2 border text-center text-gray-700">10</td>
                                <td className="p-2 border text-center text-gray-700">₹500</td>
                                <td className="p-2 border text-right text-gray-700">₹5,000</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="text-right text-xs space-y-1 mb-3">
                        <p className="text-gray-500">Subtotal: <strong className="text-gray-700">₹5,000</strong></p>
                        <p className="text-gray-500">GST (18%): <strong className="text-gray-700">₹900</strong></p>
                        <p className="text-base font-bold" style={{ color: customColors.primary }}>Total: ₹5,900</p>
                    </div>

                    {fieldToggles.showBank && (
                        <div className="text-xs text-gray-500 border-t pt-2 mb-2">
                            <strong>Bank:</strong> SBI, A/C: 12345678, IFSC: SBIN0001234
                        </div>
                    )}
                    {fieldToggles.showTerms && (
                        <div className="text-[10px] text-gray-400 border-t pt-2">
                            {termsText.split('\n').slice(0, 2).map((line, i) => <p key={i}>{line}</p>)}
                        </div>
                    )}
                </div>
            </div>

            {/* Save */}
            <button onClick={handleSave} disabled={saving}
                className="w-full py-3 bg-pink-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-pink-600 disabled:opacity-50 transition-all">
                {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <><Save className="w-5 h-5" /> Save Template</>}
            </button>
        </div>
    );
}
