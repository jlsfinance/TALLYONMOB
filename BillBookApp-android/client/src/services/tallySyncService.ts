import { pendingTransactionApi, masterApi, companyApi } from '../lib/supabase';
import { StorageService } from './storageService';
import { Customer, Product, Invoice, InvoiceItem } from '../types';

export const TallySyncService = {
    // 1. Link App Company to Tally Company
    linkCompany: async (appName: string) => {
        const { data: companies } = await companyApi.list();
        if (!companies || companies.length === 0) return null;

        // Try fuzzy match or exact match
        const match = companies.find((c: any) => c.name.toLowerCase() === appName.toLowerCase());
        return match || companies[0]; // Fallback to first if name doesn't match
    },

    // 2. Full Sync Down (Tally -> App)
    syncDown: async () => {
        const appCompany = StorageService.getCompanyProfile();
        // Default to a placeholder if name is generic, else try to match
        const tallyCompany = await TallySyncService.linkCompany(appCompany.name);

        if (!tallyCompany) {
            console.warn("No Tally Company found to sync with.");
            return;
        }

        console.log(`Syncing with Tally Company: ${tallyCompany.name}`);

        // A. Sync Ledgers -> Customers
        const { data: ledgers } = await masterApi.getLedgers(tallyCompany.id);
        if (ledgers) {
            const existingCustomers = StorageService.getCustomers();
            ledgers.forEach((ledger: any) => {
                // Check if exists by Name (Tally unique identifier usually)
                const exists = existingCustomers.find(c => c.name.toLowerCase() === ledger.name.toLowerCase());

                if (!exists) {
                    const newCustomer: Customer = {
                        id: crypto.randomUUID(),
                        name: ledger.name,
                        company: ledger.name, // Use name as company for now
                        email: '',
                        phone: '',
                        address: '',
                        balance: Math.abs(ledger.closing_balance || 0),
                        notifications: [],
                        type: ledger.parent_group?.includes('Sundry Creditors') ? 'VENDOR' : 'CUSTOMER'
                    };
                    StorageService.saveCustomer(newCustomer);
                } else {
                    // Optional: Update balance if significantly different?
                    // Avoiding overwrite of local phone/email data
                    if (exists.balance === 0 && ledger.closing_balance !== 0) {
                        exists.balance = Math.abs(ledger.closing_balance);
                        StorageService.saveCustomer(exists);
                    }
                }
            });
        }

        // B. Sync Stock -> Products
        const { data: stockItems } = await masterApi.getStockItems(tallyCompany.id);
        if (stockItems) {
            const existingProducts = StorageService.getProducts();
            stockItems.forEach((item: any) => {
                const exists = existingProducts.find(p => p.name.toLowerCase() === item.name.toLowerCase());

                if (!exists) {
                    const newProduct: Product = {
                        id: crypto.randomUUID(),
                        name: item.name,
                        price: 0,
                        stock: item.closing_balance || 0,
                        category: item.stock_group || 'General',
                        description: item.description || '',
                        hsn: item.hsn_code,
                        gstRate: item.gst_rate
                    };
                    StorageService.saveProduct(newProduct);
                } else {
                    // Update stock from Tally (Master Source)
                    if (item.closing_balance !== undefined) {
                        exists.stock = item.closing_balance;
                        StorageService.saveProduct(exists);
                    }
                }
            });
        }
    },

    // 3. Push Invoice (App -> Tally)
    pushInvoice: async (invoice: Invoice) => {
        if (!invoice) return;

        const appCompany = StorageService.getCompanyProfile();
        // Assuming user has linked company or we find one
        const tallyCompany = await TallySyncService.linkCompany(appCompany.name);
        if (!tallyCompany) return;

        // Prepare Voucher Data for Pending Transaction
        const voucherData = {
            date: invoice.date,
            partyName: invoice.customerName,
            voucherType: invoice.type === 'PURCHASE' ? 'Purchase' : 'Sales',
            amount: invoice.total,
            narration: `BillBook #${invoice.invoiceNumber}. ${invoice.notes || ''}`,
            ledgerEntries: null, // Force C# Default Logic (Safe)
            inventoryEntries: invoice.items.map((item: InvoiceItem) => ({
                stockItemName: item.productId ? (StorageService.getProducts().find(p => p.id === item.productId)?.name || item.description) : item.description,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.quantity * item.rate,
                hsnCode: item.hsn,
                taxRate: item.gstRate
            }))
        };

        await pendingTransactionApi.create(
            tallyCompany.id,
            voucherData.voucherType,
            voucherData,
            "BillBookApp"
        );
    }
};
