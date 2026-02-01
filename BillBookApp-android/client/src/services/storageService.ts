
import { Customer, Invoice, Product, DEFAULT_COMPANY, CompanyProfile, CustomerNotification, FirebaseConfig, Payment, Expense, AdminAd } from '../types';
import { FirebaseService } from './firebaseService';
import { TallySyncService } from './tallySyncService';

const getActiveCompanyId = () => localStorage.getItem('active_company_id') || '';
const activeIdentifier = getActiveCompanyId();
const keyPrefix = activeIdentifier ? `${activeIdentifier}_` : '';

const KEYS = {
  PRODUCTS: `app_${keyPrefix}products`,
  CUSTOMERS: `app_${keyPrefix}customers`,
  INVOICES: `app_${keyPrefix}invoices`,
  PAYMENTS: `app_${keyPrefix}payments`,
  EXPENSES: `app_${keyPrefix}expenses`,
  PURCHASES: `app_${keyPrefix}purchases`,
  COMPANY: `app_${keyPrefix}company`,
  FIREBASE_CONFIG: `app_${keyPrefix}firebase_config`,
  CONTACT_PREFERENCE: `app_${keyPrefix}contact_preference`,
  PRIVACY_ACCEPTED: `app_${keyPrefix}privacy_accepted`,
  ADMIN_ADS: 'app_system_admin_ads', // Global key

  // System-wide keys (not prefixed)
  COMPANIES_LIST: 'app_system_companies_list'
};

// YOUR FIREBASE CONFIGURATION (Hardcoded as requested)
const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyDOhuszbQuXpMO0WY-FXzkyY8dABjj4MHg",
  authDomain: "sample-firebase-ai-app-1f72d.firebaseapp.com",
  projectId: "sample-firebase-ai-app-1f72d",
  storageBucket: "sample-firebase-ai-app-1f72d.firebasestorage.app",
  messagingSenderId: "231225025529",
  appId: "1:231225025529:web:e079fe0aa1be713625d328"
};

// Initial Data Seeding
const SEED_PRODUCTS: Product[] = [
  { id: '1', name: 'Product A', price: 500, stock: 100, category: 'Electronics' },
  { id: '2', name: 'Product B', price: 800, stock: 45, category: 'Electronics' },
];

const SEED_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'John Doe',
    company: 'XYZ Enterprises',
    email: 'john@xyz.com',
    phone: '9123456789',
    address: '456, Business Park, Mumbai',
    balance: 0,
    notifications: []
  },
];

// In-Memory Cache
let cache = {
  products: [] as Product[],
  customers: [] as Customer[],
  invoices: [] as Invoice[],
  purchases: [] as Invoice[], // Added
  payments: [] as Payment[],
  expenses: [] as Expense[],
  company: DEFAULT_COMPANY,
  isLoaded: false,
  currentUserId: null as string | null
};

export const StorageService = {

  // --- Initialization ---
  init: async (userId: string | null = null): Promise<void> => {

    if (cache.currentUserId !== userId) {
      cache = {
        products: [], customers: [], invoices: [], purchases: [], payments: [], expenses: [],
        company: DEFAULT_COMPANY, isLoaded: false, currentUserId: userId
      };
    }

    if (cache.isLoaded) return;

    // 1. Always use the Hardcoded Config
    // Removed insecure localStorage.setItem(KEYS.FIREBASE_CONFIG, ...) violation.

    // 2. Init Firebase
    // No config used here currently
    const connected = FirebaseService.init(DEFAULT_FIREBASE_CONFIG);

    if (connected && userId) {
      // 3. Fetch Data from Firebase
      const userPath = `users/${userId}`;

      const [fbProducts, fbCustomers, fbInvoices, fbPurchases, fbPayments, fbExpenses, fbCompany] = await Promise.all([
        FirebaseService.fetchCollection<Product>(`${userPath}/products`),
        FirebaseService.fetchCollection<Customer>(`${userPath}/customers`),
        FirebaseService.fetchCollection<Invoice>(`${userPath}/invoices`),
        FirebaseService.fetchCollection<Invoice>(`${userPath}/purchases`), // Added
        FirebaseService.fetchCollection<Payment>(`${userPath}/payments`),
        FirebaseService.fetchCollection<Expense>(`${userPath}/expenses`),
        FirebaseService.fetchCollection<CompanyProfile>(`${userPath}/company`)
      ]);

      cache.products = fbProducts;
      cache.customers = fbCustomers;
      cache.invoices = fbInvoices;
      cache.purchases = fbPurchases;
      cache.payments = fbPayments;
      cache.expenses = fbExpenses;
      cache.company = fbCompany.length > 0 ? fbCompany[0] : DEFAULT_COMPANY;

      // --- AUTO-MIGRATION LOGIC ---
      // If Firebase is empty but LocalStorage has data, migrate it once.
      const isCloudEmpty = fbProducts.length === 0 && fbInvoices.length === 0 && fbCustomers.length === 0;
      if (isCloudEmpty) {
        const lsProducts = localStorage.getItem(KEYS.PRODUCTS);
        const lsCustomers = localStorage.getItem(KEYS.CUSTOMERS);
        const lsInvoices = localStorage.getItem(KEYS.INVOICES);
        const lsPurchases = localStorage.getItem(KEYS.PURCHASES);
        const lsPayments = localStorage.getItem(KEYS.PAYMENTS);
        const lsExpenses = localStorage.getItem(KEYS.EXPENSES);
        const lsCompany = localStorage.getItem(KEYS.COMPANY);

        if (lsProducts || lsInvoices || lsCustomers) {
          console.log("Empty cloud detected. Migrating local data...");
          if (lsProducts) cache.products = JSON.parse(lsProducts);
          if (lsCustomers) cache.customers = JSON.parse(lsCustomers);
          if (lsInvoices) cache.invoices = JSON.parse(lsInvoices);
          if (lsPurchases) cache.purchases = JSON.parse(lsPurchases);
          if (lsPayments) cache.payments = JSON.parse(lsPayments);
          if (lsExpenses) cache.expenses = JSON.parse(lsExpenses);
          if (lsCompany) cache.company = JSON.parse(lsCompany);

          // Push all to Firebase
          if (cache.products.length) FirebaseService.batchSave(`${userPath}/products`, cache.products);
          if (cache.customers.length) FirebaseService.batchSave(`${userPath}/customers`, cache.customers);
          if (cache.invoices.length) FirebaseService.batchSave(`${userPath}/invoices`, cache.invoices);
          if (cache.purchases.length) FirebaseService.batchSave(`${userPath}/purchases`, cache.purchases);
          if (cache.payments.length) FirebaseService.batchSave(`${userPath}/payments`, cache.payments);
          if (cache.expenses.length) FirebaseService.batchSave(`${userPath}/expenses`, cache.expenses);
          FirebaseService.saveDocument(`${userPath}/company`, 'profile', cache.company);

          // Clear LocalStorage to avoid confusion/double migration? 
          // Better keep it as backup for now or clear it. 
          // User said "sare bill kaha gaye" which implies they want them back.
        }
      }

      cache.isLoaded = true;
      // Trigger Tally Sync (Fire-and-forget)
      TallySyncService.syncDown().catch(err => console.error("Tally Sync Error:", err));
      return;
    }

    // 4. Fallback to LocalStorage (Guest Mode)
    if (!userId) {
      const lsProducts = localStorage.getItem(KEYS.PRODUCTS);
      cache.products = lsProducts ? JSON.parse(lsProducts) : SEED_PRODUCTS;

      const lsCustomers = localStorage.getItem(KEYS.CUSTOMERS);
      cache.customers = lsCustomers ? JSON.parse(lsCustomers) : SEED_CUSTOMERS;

      const lsInvoices = localStorage.getItem(KEYS.INVOICES);
      cache.invoices = lsInvoices ? JSON.parse(lsInvoices) : [];

      const lsPurchases = localStorage.getItem(KEYS.PURCHASES); // Added
      cache.purchases = lsPurchases ? JSON.parse(lsPurchases) : [];

      const lsPayments = localStorage.getItem(KEYS.PAYMENTS);
      cache.payments = lsPayments ? JSON.parse(lsPayments) : [];

      const lsExpenses = localStorage.getItem(KEYS.EXPENSES);
      cache.expenses = lsExpenses ? JSON.parse(lsExpenses) : [];

      const lsCompany = localStorage.getItem(KEYS.COMPANY);
      cache.company = lsCompany ? JSON.parse(lsCompany) : DEFAULT_COMPANY;

      cache.isLoaded = true;
    } else {
      // User logged in but no data found -> Init empty
      cache.products = [];
      cache.customers = [];
      cache.invoices = [];
      cache.purchases = []; // Added
      cache.payments = [];
      cache.expenses = [];
      cache.company = DEFAULT_COMPANY;
      cache.isLoaded = true;
    }
  },

  getCollectionPath: (col: string) => {
    if (cache.currentUserId) return `users/${cache.currentUserId}/${col}`;
    return col;
  },

  persistToLocalStorage: () => {
    if (!cache.currentUserId) {
      // Auto-Cleanup: Remove notifications older than 60 days
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];

      cache.customers.forEach(cust => {
        if (cust.notifications) {
          cust.notifications = cust.notifications.filter(n => n.date >= sixtyDaysAgoStr);
        }
      });

      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(cache.products));
      localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(cache.customers));
      localStorage.setItem(KEYS.INVOICES, JSON.stringify(cache.invoices));
      localStorage.setItem(KEYS.PURCHASES, JSON.stringify(cache.purchases));
      localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(cache.payments));
      localStorage.setItem(KEYS.EXPENSES, JSON.stringify(cache.expenses));
      localStorage.setItem(KEYS.COMPANY, JSON.stringify(cache.company));
    }
  },

  // --- Getters ---
  getProducts: (): Product[] => [...cache.products],
  getCustomers: (): Customer[] => [...cache.customers],
  getInvoices: (): Invoice[] => [...cache.invoices],
  getPurchases: (): Invoice[] => [...cache.purchases], // Added
  getPayments: (): Payment[] => [...cache.payments],
  getExpenses: (): Expense[] => [...cache.expenses],
  getCompanyProfile: (): CompanyProfile => cache.company,

  getFirebaseConfig: (): FirebaseConfig | null => {
    return DEFAULT_FIREBASE_CONFIG;
  },

  getContactPreference: (): 'ALL' | 'SELECTED' | 'NOT_SET' => {
    return (localStorage.getItem(KEYS.CONTACT_PREFERENCE) as any) || 'NOT_SET';
  },

  setContactPreference: (pref: 'ALL' | 'SELECTED') => {
    localStorage.setItem(KEYS.CONTACT_PREFERENCE, pref);
  },

  getPrivacyAccepted: (): boolean => {
    return localStorage.getItem(KEYS.PRIVACY_ACCEPTED) === 'true';
  },

  setPrivacyAccepted: (accepted: boolean) => {
    localStorage.setItem(KEYS.PRIVACY_ACCEPTED, String(accepted));
  },

  // --- Setters ---
  saveFirebaseConfig: (_config: FirebaseConfig) => {
    // No-op since we use hardcoded config, but keep for interface compatibility
    // No-op: We do not persist sensitive config to LocalStorage for security reasons.
    // Config is managed in code or via secure environment variables.
  },

  saveProduct: (product: Product) => {
    const index = cache.products.findIndex(p => p.id === product.id);
    const newProducts = [...cache.products];
    if (index >= 0) newProducts[index] = product;
    else newProducts.push(product);
    cache.products = newProducts;

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
  },

  updateProduct: (product: Product) => {
    StorageService.saveProduct(product); // Reuse save since it handles upsert
  },

  deleteProduct: (id: string) => {
    cache.products = cache.products.filter(p => p.id !== id);
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('products'), id);
  },

  saveCustomer: (customer: Customer) => {
    const index = cache.customers.findIndex(c => c.id === customer.id);
    const newCustomers = [...cache.customers];
    if (index >= 0) newCustomers[index] = customer;
    else newCustomers.push(customer);
    cache.customers = newCustomers;

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
  },

  addNotification: (customerId: string, notification: Omit<CustomerNotification, 'id' | 'read'>) => {
    const index = cache.customers.findIndex(c => c.id === customerId);
    if (index >= 0) {
      const newNotification: CustomerNotification = {
        id: crypto.randomUUID(),
        read: false,
        ...notification
      };
      const customerToUpdate = { ...cache.customers[index] }; // Create a new customer object
      if (!customerToUpdate.notifications) customerToUpdate.notifications = [];
      customerToUpdate.notifications = [newNotification, ...customerToUpdate.notifications]; // Create a new notifications array

      const newCustomers = [...cache.customers]; // Create a new customers array
      newCustomers[index] = customerToUpdate;
      cache.customers = newCustomers; // Update cache with the new array

      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customerId, cache.customers[index]);
    }
  },

  saveInvoice: (invoice: Invoice) => {
    const newProducts = [...cache.products];
    invoice.items.forEach(item => {
      const pIndex = newProducts.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && newProducts[pIndex].category !== 'Services') {
        const product = { ...newProducts[pIndex] };
        product.stock -= item.quantity;
        newProducts[pIndex] = product;
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
      }
    });
    cache.products = newProducts;

    const newCustomers = [...cache.customers];
    const cIndex = newCustomers.findIndex(c => c.id === invoice.customerId);
    if (cIndex >= 0 && invoice.status === 'PENDING') {
      const customer = { ...newCustomers[cIndex] };
      customer.balance += invoice.total;
      newCustomers[cIndex] = customer;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }
    cache.customers = newCustomers;


    // Increment global invoice sequence if used
    if (cache.company.invoiceSettings?.nextInvoiceNumber) {
      cache.company.invoiceSettings.nextInvoiceNumber = (cache.company.invoiceSettings.nextInvoiceNumber || 0) + 1;
      StorageService.saveCompanyProfile(cache.company);
    }

    cache.invoices = [invoice, ...cache.invoices];

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), invoice.id, invoice);

      // ✅ PUBLIC COPY (Safe Fields Only)
      FirebaseService.saveDocument('publicBills', invoice.id, {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerAddress: invoice.customerAddress,
        customerGstin: invoice.customerGstin,
        date: invoice.date,
        items: invoice.items,
        subtotal: invoice.subtotal,
        total: invoice.total,
        totalCgst: invoice.totalCgst || 0,
        totalSgst: invoice.totalSgst || 0,
        totalIgst: invoice.totalIgst || 0,
        gstEnabled: invoice.gstEnabled,
        status: invoice.status,
        notes: invoice.notes,
        _company: {
          name: cache.company.name,
          address: cache.company.address,
          phone: cache.company.phone,
          gstin: cache.company.gstin || cache.company.gst,
          upiId: cache.company.upiId
        },
        publicToken: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    StorageService.addNotification(invoice.customerId, {
      type: 'INVOICE',
      title: 'New Invoice Generated',
      message: `Invoice #${invoice.invoiceNumber} for ₹${invoice.total} has been created.`,
      date: new Date().toISOString().split('T')[0]
    });

    // PUSH TO TALLY
    TallySyncService.pushInvoice(invoice).catch(console.error);
  },

  saveCreditNote: (invoice: Invoice) => {
    invoice.type = 'CREDIT_NOTE';
    const newProducts = [...cache.products];

    // 1. Stock Logic: INCREASE stock on return
    invoice.items.forEach(item => {
      const pIndex = newProducts.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && newProducts[pIndex].category !== 'Services') {
        const product = { ...newProducts[pIndex] };
        product.stock += item.quantity;
        newProducts[pIndex] = product;
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
      }
    });
    cache.products = newProducts;

    // 2. Customer Balance Logic: DECREASE balance (Credit)
    const newCustomers = [...cache.customers];
    const cIndex = newCustomers.findIndex(c => c.id === invoice.customerId);
    if (cIndex >= 0 && invoice.status === 'PENDING') {
      const customer = { ...newCustomers[cIndex] };
      customer.balance -= invoice.total;
      newCustomers[cIndex] = customer;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }
    cache.customers = newCustomers;

    cache.invoices = [invoice, ...cache.invoices];

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), invoice.id, invoice);

      // ✅ PUBLIC COPY (Safe Fields Only)
      FirebaseService.saveDocument('publicBills', invoice.id, {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerAddress: invoice.customerAddress,
        customerGstin: invoice.customerGstin,
        date: invoice.date,
        items: invoice.items,
        subtotal: invoice.subtotal,
        total: invoice.total,
        totalCgst: invoice.totalCgst || 0,
        totalSgst: invoice.totalSgst || 0,
        totalIgst: invoice.totalIgst || 0,
        gstEnabled: invoice.gstEnabled,
        status: invoice.status,
        type: 'CREDIT_NOTE',
        notes: invoice.notes,
        _company: {
          name: cache.company.name,
          address: cache.company.address,
          phone: cache.company.phone,
          gstin: cache.company.gstin || cache.company.gst,
          upiId: cache.company.upiId
        },
        publicToken: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    StorageService.addNotification(invoice.customerId, {
      type: 'INVOICE',
      title: 'Credit Note Created',
      message: `Credit Note #${invoice.invoiceNumber} for ₹${invoice.total} has been credited to your account.`,
      date: new Date().toISOString().split('T')[0]
    });
  },

  savePayment: (payment: Payment) => {
    cache.payments = [payment, ...cache.payments];

    const newCustomers = [...cache.customers];
    const cIndex = newCustomers.findIndex(c => c.id === payment.customerId);
    if (cIndex >= 0) {
      const customer = { ...newCustomers[cIndex] };
      customer.balance -= payment.amount;
      newCustomers[cIndex] = customer;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }
    cache.customers = newCustomers;

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('payments'), payment.id, payment);

    StorageService.addNotification(payment.customerId, {
      type: 'PAYMENT',
      title: 'Payment Received',
      message: `Payment of ₹${payment.amount} received via ${payment.mode}.`,
      date: payment.date
    });
  },

  updatePayment: (updatedPayment: Payment) => {
    const index = cache.payments.findIndex(p => p.id === updatedPayment.id);
    if (index === -1) return;

    const oldPayment = cache.payments[index];
    const customer = cache.customers.find(c => c.id === updatedPayment.customerId);

    if (customer) {
      // Revert old amount, add new
      customer.balance += oldPayment.amount;
      customer.balance -= updatedPayment.amount;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }

    cache.payments[index] = updatedPayment;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('payments'), updatedPayment.id, updatedPayment);
  },

  deletePayment: (paymentId: string) => {
    const index = cache.payments.findIndex(p => p.id === paymentId);
    if (index === -1) return;

    const payment = cache.payments[index];
    const customer = cache.customers.find(c => c.id === payment.customerId);

    if (customer) {
      customer.balance += payment.amount;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }

    cache.payments.splice(index, 1);
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('payments'), paymentId);
  },

  deleteInvoice: (invoiceId: string) => {
    const index = cache.invoices.findIndex(i => i.id === invoiceId);
    if (index === -1) return;
    const invoice = cache.invoices[index];
    const isCreditNote = invoice.type === 'CREDIT_NOTE';

    invoice.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        const product = cache.products[pIndex];
        // If Sale: We removed stock, so add it back.
        // If Credit Note: We added stock, so remove it.
        if (isCreditNote) {
          product.stock -= item.quantity;
        } else {
          product.stock += item.quantity;
        }
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
      }
    });

    const cIndex = cache.customers.findIndex(c => c.id === invoice.customerId);
    if (cIndex >= 0 && invoice.status === 'PENDING') {
      const customer = cache.customers[cIndex];
      // If Sale: We increased balance, so decrease it.
      // If Credit Note: We decreased balance, so increase it.
      if (isCreditNote) {
        customer.balance += invoice.total;
      } else {
        customer.balance -= invoice.total;
      }
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }

    cache.invoices.splice(index, 1);
    StorageService.persistToLocalStorage();

    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('invoices'), invoiceId);
  },

  // --- Purchase Logic ---
  savePurchase: (purchase: Invoice) => {
    purchase.type = 'PURCHASE'; // Ensure Type
    const newProducts = [...cache.products];

    // 1. Update Stock & Purchase Price & GST
    purchase.items.forEach(item => {
      const pIndex = newProducts.findIndex(p => p.id === item.productId);
      if (pIndex >= 0) {
        const product = { ...newProducts[pIndex] };

        // Increase Stock
        if (product.category !== 'Services') {
          product.stock += item.quantity;
        }

        // Update Purchase Price (Weighted Avg could be better, but simple update for now or just last purchase price)
        // Let's just update the "purchasePrice" field if we added it, or just keep it simple.
        if (item.rate > 0) product.purchasePrice = item.rate;

        // Update GST Rate if different (and enabled) - User requirement: "sale me bhi vhi gst % use ho"
        if (purchase.gstEnabled && item.gstRate !== undefined && item.gstRate > 0) {
          product.gstRate = item.gstRate;
        }

        newProducts[pIndex] = product;
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
      }
    });
    cache.products = newProducts;

    // 2. Update Vendor Balance (Creditor Logic)
    // If we buy on credit, we OWE money. Balance should be NEGATIVE (Credit) or we track 'Payable'.
    // In this app, Customer Balance > 0 usually means they owe us (Receivable).
    // So if we buy on credit, we should DECREASE their balance (make it negative).

    const newCustomers = [...cache.customers];
    const cIndex = newCustomers.findIndex(c => c.id === purchase.customerId);
    if (cIndex >= 0 && purchase.status === 'PENDING') {
      const vendor = { ...newCustomers[cIndex] };
      // Decrement because we OWE them.
      vendor.balance -= purchase.total;
      vendor.type = vendor.type === 'CUSTOMER' ? 'BOTH' : (vendor.type || 'VENDOR');
      newCustomers[cIndex] = vendor;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), vendor.id, vendor);
    }
    cache.customers = newCustomers;

    cache.purchases = [purchase, ...cache.purchases];

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('purchases'), purchase.id, purchase);
    }

    // PUSH TO TALLY
    TallySyncService.pushInvoice(purchase).catch(console.error);
  },

  deletePurchase: (purchaseId: string) => {
    const index = cache.purchases.findIndex(p => p.id === purchaseId);
    if (index === -1) return;
    const purchase = cache.purchases[index];

    // 1. Revert Stock (Decrease)
    purchase.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        cache.products[pIndex].stock -= item.quantity;
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), cache.products[pIndex].id, cache.products[pIndex]);
      }
    });

    // 2. Revert Vendor Balance (Increase - remove debt)
    const cIndex = cache.customers.findIndex(c => c.id === purchase.customerId);
    if (cIndex >= 0 && purchase.status === 'PENDING') {
      cache.customers[cIndex].balance += purchase.total;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), cache.customers[cIndex].id, cache.customers[cIndex]);
    }

    cache.purchases.splice(index, 1);
    StorageService.persistToLocalStorage();

    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('purchases'), purchaseId);
  },

  updatePurchase: (updatedPurchase: Invoice) => {
    // Simplistic approach: delete old, save new. 
    // This is safer for complex stock/balance logic than diffing manually, though slightly less efficient.
    // But we need to keep the ID same.
    const oldIndex = cache.purchases.findIndex(p => p.id === updatedPurchase.id);
    if (oldIndex === -1) return;

    const oldPurchase = cache.purchases[oldIndex];

    // 1. Revert Old Stock
    oldPurchase.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        cache.products[pIndex].stock -= item.quantity;
      }
    });
    // 2. Revert Old Balance
    const oldCIndex = cache.customers.findIndex(c => c.id === oldPurchase.customerId);
    if (oldCIndex >= 0 && oldPurchase.status === 'PENDING') {
      cache.customers[oldCIndex].balance += oldPurchase.total;
    }

    // 3. Apply New Stock
    updatedPurchase.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        cache.products[pIndex].stock += item.quantity;
        // Update Cost Price again? Yes
        if (item.rate > 0) cache.products[pIndex].purchasePrice = item.rate;
      }
    });
    // 4. Apply New Balance
    const newCIndex = cache.customers.findIndex(c => c.id === updatedPurchase.customerId);
    if (newCIndex >= 0 && updatedPurchase.status === 'PENDING') {
      cache.customers[newCIndex].balance -= updatedPurchase.total;
    }

    // Save changes to Collections

    // Update Products
    if (FirebaseService.isReady()) {
      // Saving all products might be too much, but needed if we touched multiple. 
      // Optimization: only save modified products.
      const affectedProductIds = new Set([...oldPurchase.items, ...updatedPurchase.items].map(i => i.productId));
      affectedProductIds.forEach(pid => {
        const p = cache.products.find(prod => prod.id === pid);
        if (p) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), p.id, p);
      });

      const oldC = cache.customers[oldCIndex];
      if (oldC) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), oldC.id, oldC);

      if (oldCIndex !== newCIndex) {
        const newC = cache.customers[newCIndex];
        if (newC) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), newC.id, newC);
      }
    }

    cache.purchases[oldIndex] = updatedPurchase;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('purchases'), updatedPurchase.id, updatedPurchase);
  },

  updateInvoice: (updatedInvoice: Invoice) => {
    const oldInvoiceIndex = cache.invoices.findIndex(i => i.id === updatedInvoice.id);
    if (oldInvoiceIndex === -1) return;
    const oldInvoice = cache.invoices[oldInvoiceIndex];

    const modifiedProductIds = new Set<string>();
    const oldIsCreditNote = oldInvoice.type === 'CREDIT_NOTE';
    const newIsCreditNote = updatedInvoice.type === 'CREDIT_NOTE';

    // 1. Revert Old Logic
    oldInvoice.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        if (oldIsCreditNote) {
          cache.products[pIndex].stock -= item.quantity;
        } else {
          cache.products[pIndex].stock += item.quantity;
        }
        modifiedProductIds.add(cache.products[pIndex].id);
      }
    });

    const oldCIndex = cache.customers.findIndex(c => c.id === oldInvoice.customerId);
    if (oldCIndex >= 0 && oldInvoice.status === 'PENDING') {
      if (oldIsCreditNote) {
        cache.customers[oldCIndex].balance += oldInvoice.total;
      } else {
        cache.customers[oldCIndex].balance -= oldInvoice.total;
      }
    }

    // 2. Apply New Logic
    updatedInvoice.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        if (newIsCreditNote) {
          cache.products[pIndex].stock += item.quantity;
        } else {
          cache.products[pIndex].stock -= item.quantity;
        }
        modifiedProductIds.add(cache.products[pIndex].id);
      }
    });

    const newCIndex = cache.customers.findIndex(c => c.id === updatedInvoice.customerId);
    if (newCIndex >= 0 && updatedInvoice.status === 'PENDING') {
      if (newIsCreditNote) {
        cache.customers[newCIndex].balance -= updatedInvoice.total;
      } else {
        cache.customers[newCIndex].balance += updatedInvoice.total;
      }
    }

    if (FirebaseService.isReady()) {
      modifiedProductIds.forEach(pid => {
        const product = cache.products.find(p => p.id === pid);
        if (product) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
      });

      const oldC = cache.customers[oldCIndex];
      if (oldC) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), oldC.id, oldC);

      if (oldCIndex !== newCIndex) {
        const newC = cache.customers[newCIndex];
        if (newC) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), newC.id, newC);
      }
    }

    cache.invoices[oldInvoiceIndex] = updatedInvoice;

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), updatedInvoice.id, updatedInvoice);

      // ✅ UPDATE PUBLIC COPY (Safe Fields Only)
      FirebaseService.saveDocument('publicBills', updatedInvoice.id, {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        customerName: updatedInvoice.customerName,
        customerAddress: updatedInvoice.customerAddress,
        customerGstin: updatedInvoice.customerGstin,
        date: updatedInvoice.date,
        items: updatedInvoice.items,
        subtotal: updatedInvoice.subtotal,
        total: updatedInvoice.total,
        totalCgst: updatedInvoice.totalCgst || 0,
        totalSgst: updatedInvoice.totalSgst || 0,
        totalIgst: updatedInvoice.totalIgst || 0,
        gstEnabled: updatedInvoice.gstEnabled,
        status: updatedInvoice.status,
        notes: updatedInvoice.notes,
        _company: {
          name: cache.company.name,
          address: cache.company.address,
          phone: cache.company.phone,
          gstin: cache.company.gstin || cache.company.gst,
          upiId: cache.company.upiId
        },
        publicToken: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    if (oldInvoice.total !== updatedInvoice.total) {
      StorageService.addNotification(updatedInvoice.customerId, {
        type: 'INVOICE',
        title: 'Invoice Updated',
        message: `Invoice #${updatedInvoice.invoiceNumber} has been updated to ₹${updatedInvoice.total}.`,
        date: new Date().toISOString().split('T')[0]
      });
    }
  },

  saveCompanyProfile: (profile: CompanyProfile) => {
    cache.company = profile;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('company'), 'profile', profile);
  },

  getLastSalePrice: (customerId: string, productId: string): number | null => {
    const customerInvoices = cache.invoices.filter(inv => inv.customerId === customerId);
    for (const inv of customerInvoices) {
      const item = inv.items.find(i => i.productId === productId);
      if (item) return item.rate;
    }
    return null;
  },

  getCustomerBehaviorScore: (customerId: string): number => {
    const invoices = cache.invoices.filter(i => i.customerId === customerId);
    if (invoices.length === 0) return 100;

    const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);
    const totalPaid = cache.payments
      .filter(p => p.customerId === customerId)
      .reduce((sum, p) => sum + p.amount, 0) +
      invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.total, 0);

    if (totalInvoiced === 0) return 100;
    const score = (totalPaid / totalInvoiced) * 100;
    return Math.min(Math.round(score), 100);
  },

  predictNextItem: (customerId: string): Product | null => {
    if (!customerId) return null;
    const customerInvoices = cache.invoices.filter(inv => inv.customerId === customerId);
    if (customerInvoices.length === 0) {
      // Return most popular product overall
      const productCounts: Record<string, number> = {};
      cache.invoices.forEach(inv => {
        inv.items.forEach(item => {
          productCounts[item.productId] = (productCounts[item.productId] || 0) + 1;
        });
      });
      const topProductId = Object.keys(productCounts).sort((a, b) => productCounts[b] - productCounts[a])[0];
      return topProductId ? cache.products.find(p => p.id === topProductId) || null : null;
    }

    const counts: Record<string, number> = {};
    customerInvoices.forEach(inv => {
      inv.items.forEach(item => {
        counts[item.productId] = (counts[item.productId] || 0) + 1;
      });
    });

    const bestId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return bestId ? cache.products.find(p => p.id === bestId) || null : null;
  },

  updateCustomer: (customer: Customer) => {
    const index = cache.customers.findIndex(c => c.id === customer.id);
    if (index >= 0) {
      cache.customers[index] = customer;
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }
  },

  deleteCustomer: (customerId: string) => {
    const index = cache.customers.findIndex(c => c.id === customerId);
    if (index >= 0) {
      cache.customers.splice(index, 1);
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('customers'), customerId);
    }
  },

  saveExpense: (expense: Expense) => {
    const index = cache.expenses.findIndex(e => e.id === expense.id);
    if (index >= 0) cache.expenses[index] = expense;
    else cache.expenses.unshift(expense);

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('expenses'), expense.id, expense);
  },

  deleteExpense: (expenseId: string) => {
    const index = cache.expenses.findIndex(e => e.id === expenseId);
    if (index >= 0) {
      cache.expenses.splice(index, 1);
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('expenses'), expenseId);
    }
  },

  // --- FCM Token Management (For Push Notifications) ---
  saveFcmToken: async (token: string) => {
    if (!cache.currentUserId || !FirebaseService.isReady()) return;
    try {
      // Save directly to the User Document `users/{userId}`
      await FirebaseService.saveDocument('users', cache.currentUserId, { fcmToken: token });
    } catch (e) {
      console.error('Failed to save FCM Token:', e);
    }
  },

  getAllFcmTokens: async (): Promise<string[]> => {
    if (!FirebaseService.isReady()) return [];
    try {
      // This requires 'users' collection to be readable by Admin
      // Since I'm Admin (Spark Plan Owner), I can read global collections if rules allow
      // Assuming rules allow read for auth users or similar
      const users = await FirebaseService.fetchCollection<any>('users');
      return users.map(u => u.fcmToken).filter(t => !!t);
    } catch (e) {
      console.error('Failed to fetch FCM tokens:', e);
      return [];
    }
  },

  generateInvoiceNumber: (customerId: string, invoiceDate: string): string => {
    const { invoiceSettings } = cache.company;

    // Custom Numbering Scheme
    if (invoiceSettings?.invoicePrefix || invoiceSettings?.invoiceSuffix || invoiceSettings?.nextInvoiceNumber) {
      const prefix = invoiceSettings.invoicePrefix || '';
      const suffix = invoiceSettings.invoiceSuffix || '';
      const nextNum = invoiceSettings.nextInvoiceNumber || 1;
      return `${prefix}${nextNum}${suffix}`;
    }

    // Default Fallback Scheme (Customer Based)
    const customer = cache.customers.find(c => c.id === customerId);
    if (!customer) return `inv-${Date.now()}`;

    // Get first 3 letters of customer name (lowercase)
    const customerPrefix = customer.name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toLowerCase();

    // Get 3 letter month from invoice date (lowercase)
    const date = new Date(invoiceDate);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthPrefix = months[date.getMonth()];

    // Determine financial year (April to March)
    const fyStartMonth = 3; // April is month 3 (0-indexed)
    let fyStartYear = date.getFullYear();
    if (date.getMonth() < fyStartMonth) {
      fyStartYear -= 1;
    }
    const fyStart = new Date(fyStartYear, fyStartMonth, 1);
    const fyEnd = new Date(fyStartYear + 1, fyStartMonth, 0);

    // Count existing invoices for this customer in current FY
    const customerInvoicesInFY = cache.invoices.filter(inv => {
      if (inv.customerId !== customerId) return false;
      const invDate = new Date(inv.date);
      return invDate >= fyStart && invDate <= fyEnd;
    });

    const sequenceNumber = (customerInvoicesInFY.length + 1).toString().padStart(3, '0');

    return `${customerPrefix}${monthPrefix}${sequenceNumber}`;
  },

  exportAllData: (): string => {
    const data = {
      products: JSON.stringify(cache.products),
      customers: JSON.stringify(cache.customers),
      invoices: JSON.stringify(cache.invoices),
      payments: JSON.stringify(cache.payments),
      expenses: JSON.stringify(cache.expenses),
      company: JSON.stringify(cache.company),
      timestamp: new Date().toISOString()
    };
    return JSON.stringify(data);
  },

  importData: async (jsonString: string): Promise<{ success: boolean; message: string }> => {
    try {
      let data;
      try {
        data = JSON.parse(jsonString);
      } catch (parseError) {
        return { success: false, message: "Invalid JSON file format." };
      }

      if (data.products) cache.products = JSON.parse(data.products);
      if (data.customers) cache.customers = JSON.parse(data.customers);
      if (data.invoices) cache.invoices = JSON.parse(data.invoices);
      if (data.payments) cache.payments = JSON.parse(data.payments);
      if (data.expenses) cache.expenses = JSON.parse(data.expenses);
      if (data.company) cache.company = JSON.parse(data.company);
      // Purchases might be missing in older backups, handle safely
      if (data.purchases) {
        cache.purchases = JSON.parse(data.purchases);
      } else if (data.products) {
        // If no purchases data but products exist, we keep cache.purchases or init empty
        cache.purchases = [];
      }

      StorageService.persistToLocalStorage();

      if (FirebaseService.isReady() && cache.currentUserId) {
        // Sync restored data UP to Firebase
        try {
          const userPath = `users/${cache.currentUserId}`;
          const saveCollection = async (items: any[], name: string) => {
            for (const item of items) {
              await FirebaseService.saveDocument(`${userPath}/${name}`, item.id, item);
            }
          };

          await FirebaseService.saveDocument(`${userPath}/company`, 'profile', cache.company);
          await saveCollection(cache.products, 'products');
          await saveCollection(cache.customers, 'customers');
          await saveCollection(cache.invoices, 'invoices');
          await saveCollection(cache.payments, 'payments');
          await saveCollection(cache.expenses, 'expenses');
          await saveCollection(cache.purchases, 'purchases');
        } catch (cloudError: any) {
          console.error("Cloud Sync Failed", cloudError);
          return { success: true, message: "Local data restored, but Cloud Sync failed: " + (cloudError.message || "Unknown error") };
        }
      }

      return { success: true, message: "Data restored successfully!" };
    } catch (e: any) {
      console.error("Import failed", e);
      return { success: false, message: "Import failed: " + (e.message || "Unknown error") };
    }
  },

  syncAllToPublic: async (): Promise<{ success: boolean; count: number }> => {
    if (!FirebaseService.isReady()) return { success: false, count: 0 };

    try {
      let count = 0;
      for (const invoice of cache.invoices) {
        await FirebaseService.saveDocument('publicBills', invoice.id, {
          ...invoice,
          _company: cache.company
        });
        count++;
      }
      return { success: true, count };
    } catch (err) {
      console.error("Sync Error:", err);
      return { success: false, count: 0 };
    }
  },

  // --- Multi-Company Support ---

  getAllCompanies: (): CompanyProfile[] => {
    const list = localStorage.getItem(KEYS.COMPANIES_LIST);
    const companies: CompanyProfile[] = list ? JSON.parse(list) : [];

    // Ensure current company (from cache) is in the list
    if (cache.company && !companies.some(c => c.name === cache.company.name)) {
      // If current company has no ID, give it 'default' or existing active ID
      const activeId = getActiveCompanyId();
      const currentWithId = { ...cache.company, id: activeId || 'default' };
      companies.push(currentWithId);
      localStorage.setItem(KEYS.COMPANIES_LIST, JSON.stringify(companies));
    }
    return companies;
  },

  createCompany: (profile: CompanyProfile) => {
    const companies = StorageService.getAllCompanies();
    const newId = crypto.randomUUID();
    const newCompany = { ...profile, id: newId };
    companies.push(newCompany);
    localStorage.setItem(KEYS.COMPANIES_LIST, JSON.stringify(companies));

    // Switch to it immediately? Usually user wants to switch explicitly, but let's just save.
    return newId;
  },

  switchCompany: (companyId: string) => {
    // 1. Save current state first to be safe
    StorageService.persistToLocalStorage();

    // 2. Set new active ID
    // If switching to 'default' (legacy), use empty string if we treat it that way, 
    // but better to use the ID consistent with how we stored it.
    // If id matches 'default', we might map it to '' or keep it 'default'.
    // Given my dynamic key logic: 
    // const activeIdentifier = getActiveCompanyId(); 
    // const keyPrefix = activeIdentifier ? `${activeIdentifier}_` : '';

    // If companyId is 'default', let's assume valid ID or special handling.
    // For simplicity, just set check:
    localStorage.setItem('active_company_id', companyId === 'default' ? '' : companyId);

    // 3. Reload to re-initialize KEYS and Cache
    window.location.reload();
  },

  // --- Admin Ads (Super Admin Feature) ---
  getAdminAds: (): AdminAd[] => {
    try {
      const stored = localStorage.getItem(KEYS.ADMIN_ADS);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  },

  saveAdminAds: (ads: AdminAd[]) => {
    localStorage.setItem(KEYS.ADMIN_ADS, JSON.stringify(ads));
    // In a real app, you would also save to Firestore here:
    // FirebaseService.saveCollection('system/ads', ads);
  },

  // --- Changelog & Notification Helpers ---
  getLastSeenVersion: (): string | null => {
    return localStorage.getItem('app_last_seen_version');
  },

  setLastSeenVersion: (version: string) => {
    localStorage.setItem('app_last_seen_version', version);
  },

  getShouldShowChangelog: (): boolean => {
    return localStorage.getItem('app_should_show_changelog') === 'true';
  },

  setShouldShowChangelog: (should: boolean) => {
    localStorage.setItem('app_should_show_changelog', String(should));
  },

  getLastNotificationDate: (): string | null => {
    return localStorage.getItem('app_last_notification_date');
  },

  setLastNotificationDate: (date: string) => {
    localStorage.setItem('app_last_notification_date', date);
  }
};
