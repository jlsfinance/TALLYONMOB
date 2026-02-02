import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { masterApi, pendingTransactionApi } from '../lib/supabase';
import { format } from 'date-fns';
import '../styles/Material3.css';

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

        // If item selected, set rate from stock item (if available)
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

    if (loading) {
        return (
            <div className="page-m3">
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                    <p>Loading masters...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-m3">
            <header className="page-m3__header">
                <h1 className="page-m3__title">
                    <Link to="/sales" className="text-gray-400 mr-2 hover:text-green-700 no-underline">←</Link>
                    New Sales Invoice
                </h1>
                <p className="page-m3__subtitle">Create a new invoice to be synced with Tally</p>
            </header>

            <form onSubmit={handleSubmit} className="page-m3__form-container">
                {/* Party & Date Section */}
                <div className="page-m3__form-section">
                    <h2 className="page-m3__form-title">Invoice Details</h2>

                    <div className="page-m3__form-group">
                        <label className="page-m3__label">Party A/c Name</label>
                        <select
                            value={formData.partyId}
                            onChange={(e) => handleHeaderChange('partyId', e.target.value)}
                            className="page-m3__select"
                            required
                        >
                            <option value="">Select Party</option>
                            {ledgers.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="page-m3__form-row">
                        <div className="page-m3__form-group">
                            <label className="page-m3__label">Date</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => handleHeaderChange('date', e.target.value)}
                                className="page-m3__input"
                                required
                            />
                        </div>
                        <div className="page-m3__form-group">
                            <label className="page-m3__label">Ref No (Optional)</label>
                            <input
                                type="text"
                                value={formData.reference}
                                onChange={(e) => handleHeaderChange('reference', e.target.value)}
                                className="page-m3__input"
                                placeholder="e.g. INV/001"
                            />
                        </div>
                    </div>
                </div>

                {/* Items Section */}
                <div className="page-m3__form-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 className="page-m3__form-title">Items</h2>
                    </div>

                    {formData.items.map((item, index) => (
                        <div key={index} className="page-m3__item-row">
                            {formData.items.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeItem(index)}
                                    className="page-m3__remove-btn"
                                    title="Remove Item"
                                >
                                    ×
                                </button>
                            )}

                            <div className="page-m3__form-group" style={{ marginBottom: '12px' }}>
                                <select
                                    value={item.itemId}
                                    onChange={(e) => handleItemChange(index, 'itemId', e.target.value)}
                                    className="page-m3__select"
                                    required
                                >
                                    <option value="">Select Item</option>
                                    {stockItems.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' }}>Qty</label>
                                    <input
                                        type="number"
                                        value={item.quantity}
                                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                        className="page-m3__input"
                                        style={{ width: '100%', padding: '8px', textAlign: 'right' }}
                                        placeholder="0"
                                        min="0.1"
                                        step="any"
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' }}>Rate</label>
                                    <input
                                        type="number"
                                        value={item.rate}
                                        onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                                        className="page-m3__input"
                                        style={{ width: '100%', padding: '8px', textAlign: 'right' }}
                                        placeholder="0.00"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' }}>Amount</label>
                                    <div style={{
                                        padding: '8px',
                                        background: '#e0e2ec',
                                        borderRadius: '8px',
                                        textAlign: 'right',
                                        fontWeight: 'bold',
                                        color: '#1b5e20',
                                        height: '42px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-end'
                                    }}>
                                        {item.amount.toLocaleString('en-IN')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    <button
                        type="button"
                        onClick={addItem}
                        className="page-m3__add-btn"
                    >
                        <span>+</span> Add Another Item
                    </button>
                </div>

                {/* Footer Section: Narration & Total */}
                <div className="page-m3__form-section">
                    <div className="page-m3__form-group">
                        <label className="page-m3__label">Narration</label>
                        <textarea
                            value={formData.narration}
                            onChange={(e) => handleHeaderChange('narration', e.target.value)}
                            className="page-m3__textarea"
                            rows="3"
                            placeholder="Enter remarks..."
                        ></textarea>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid #e0e2ec' }}>
                        <span style={{ fontSize: '18px', fontWeight: '600', color: '#4b5563' }}>Total Amount</span>
                        <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#1b5e20' }}>
                            ₹{calculateTotal().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="page-m3__form-actions">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="page-m3__button page-m3__button--secondary"
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="page-m3__button page-m3__button--primary"
                        disabled={submitting}
                        style={{ padding: '8px 24px' }}
                    >
                        {submitting ? 'Saving...' : 'Save Invoice'}
                    </button>
                </div>

            </form>
        </div>
    );
}

