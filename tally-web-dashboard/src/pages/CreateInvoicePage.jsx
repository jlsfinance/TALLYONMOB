import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { masterApi, pendingTransactionApi } from '../lib/supabase';
import { format } from 'date-fns';

export default function CreateInvoicePage() {
    const { selectedCompany } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [ledgers, setLedgers] = useState([]);
    const [stockItems, setStockItems] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        partyId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        reference: '',
        narration: '',
        items: [{ itemId: '', quantity: 1, rate: 0, amount: 0 }]
    });

    // Load Master Data
    useEffect(() => {
        if (!selectedCompany) return;
        loadMasters();
    }, [selectedCompany]);

    const loadMasters = async () => {
        try {
            setLoading(true);
            const [lRes, sRes] = await Promise.all([
                masterApi.getLedgers(selectedCompany.id),
                masterApi.getStockItems(selectedCompany.id)
            ]);

            // Filter only likely parties (Sundry Debtors/Creditors/Sales)
            // Tally parent hierarchy is complex, so we'll just show all but prioritize later loops if needed.
            // For now, sorting alphabetically.
            setLedgers(lRes.data || []);
            setStockItems(sRes.data || []);
        } catch (error) {
            console.error('Error loading masters:', error);
        } finally {
            setLoading(false);
        }
    };

    // Form Handlers
    const handleHeaderChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        const item = { ...newItems[index], [field]: value };

        // Auto-calculate amount
        if (field === 'quantity' || field === 'rate') {
            item.amount = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
        }

        // If item selected, set rate from stock item (if available) - TODO
        if (field === 'itemId') {
            const stock = stockItems.find(s => s.id === value);
            if (stock) {
                item.itemName = stock.name;
                // item.rate = stock.last_sale_rate; // If we had this
            }
        }

        newItems[index] = item;
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { itemId: '', quantity: 1, rate: 0, amount: 0 }]
        }));
    };

    const removeItem = (index) => {
        if (formData.items.length === 1) return;
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const calculateTotal = () => {
        return formData.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.partyId) return alert('Please select a party');
        if (formData.items.some(i => !i.itemId)) return alert('Please select items for all rows');

        try {
            setSubmitting(true);

            const party = ledgers.find(l => l.id === formData.partyId);

            // Construct Pending Transaction Payload
            const payload = {
                company_id: selectedCompany.id,
                voucher_type: 'Sales', // Hardcoded for now
                voucher_date: formData.date,
                party_ledger_name: party?.name,
                reference_no: formData.reference,
                narration: formData.narration,
                inventory_entries: formData.items.map(i => ({
                    stock_item_name: stockItems.find(s => s.id === i.itemId)?.name,
                    quantity: i.quantity,
                    rate: i.rate,
                    amount: i.amount
                })),
                amount: calculateTotal()
            };

            await pendingTransactionApi.create({
                company_id: selectedCompany.id,
                transaction_type: 'VOUCHER',
                status: 'PENDING',
                content: payload
            });

            alert('Invoice saved successfully! It will sync to Tally shortly.');
            navigate('/sales');

        } catch (error) {
            console.error('Error saving invoice:', error);
            alert('Failed to save invoice');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading masters...</div>;

    return (
        <div className="pb-24 lg:pb-8">
            {/* Header */}
            <div className="bg-white sticky top-0 z-10 p-4 border-b flex items-center justify-between shadow-sm rounded-t-2xl lg:rounded-none">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-xl font-bold text-gray-800">New Sales Invoice</h1>
                <div className="w-10"></div> {/* Spacer for center alignment */}
            </div>

            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto p-4 space-y-6">

                {/* Party & Date Section */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Party A/c Name</label>
                        <select
                            value={formData.partyId}
                            onChange={(e) => handleHeaderChange('partyId', e.target.value)}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                            required
                        >
                            <option value="">Select Party</option>
                            {ledgers.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => handleHeaderChange('date', e.target.value)}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Ref No (Optional)</label>
                            <input
                                type="text"
                                value={formData.reference}
                                onChange={(e) => handleHeaderChange('reference', e.target.value)}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                placeholder="e.g. INV/001"
                            />
                        </div>
                    </div>
                </div>

                {/* Items Section */}
                <div className="space-y-3">
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider px-2">Items</h2>
                    {formData.items.map((item, index) => (
                        <div key={index} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative group">

                            {/* Remove Button */}
                            {formData.items.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeItem(index)}
                                    className="absolute -top-2 -right-2 bg-red-100 text-red-500 p-1 rounded-full shadow-sm hover:bg-red-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}

                            <div className="space-y-3">
                                <select
                                    value={item.itemId}
                                    onChange={(e) => handleItemChange(index, 'itemId', e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-medium"
                                    required
                                >
                                    <option value="">Select Item</option>
                                    {stockItems.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase font-bold">Qty</label>
                                        <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-right"
                                            placeholder="0"
                                            min="0.1"
                                            step="any"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase font-bold">Rate</label>
                                        <input
                                            type="number"
                                            value={item.rate}
                                            onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-right"
                                            placeholder="0.00"
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase font-bold">Amount</label>
                                        <div className="w-full p-2 bg-gray-100 border border-transparent rounded-lg text-right font-bold text-gray-700">
                                            {item.amount.toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    <button
                        type="button"
                        onClick={addItem}
                        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-emerald-500 hover:text-emerald-500 transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Another Item
                    </button>
                </div>

                {/* Footer Section: Narration & Total */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Narration</label>
                        <textarea
                            value={formData.narration}
                            onChange={(e) => handleHeaderChange('narration', e.target.value)}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none h-20"
                            placeholder="Enter remarks..."
                        ></textarea>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                        <span className="text-lg font-bold text-gray-600">Total Amount</span>
                        <span className="text-2xl font-bold text-emerald-600">
                            ₹{calculateTotal().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t shadow-lg flex gap-3 lg:relative lg:bg-transparent lg:border-none lg:shadow-none lg:p-0">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Saving...
                            </>
                        ) : (
                            'Save Invoice'
                        )}
                    </button>
                </div>

            </form>
        </div>
    );
}
