import {
  customers,
  products,
  invoices,
  invoiceItems,
  payments,
  type Customer,
  type InsertCustomer,
  type Product,
  type InsertProduct,
  type Invoice,
  type InsertInvoice,
  type Payment,
  type InsertPayment,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Customers
  getCustomers(userId: string): Promise<Customer[]>;
  getCustomer(userId: string, id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(userId: string, id: string, customer: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(userId: string, id: string): Promise<void>;
  updateCustomerBalance(userId: string, customerId: string, delta: number): Promise<void>;

  // Products
  getProducts(userId: string): Promise<Product[]>;
  getProduct(userId: string, id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(userId: string, id: string, product: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(userId: string, id: string): Promise<void>;
  updateProductStock(userId: string, productId: string, delta: number): Promise<void>;

  // Invoices
  getInvoices(userId: string): Promise<any[]>;
  getInvoice(userId: string, id: string): Promise<any | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<any>;
  updateInvoice(userId: string, id: string, invoice: Partial<InsertInvoice>): Promise<any>;
  deleteInvoice(userId: string, id: string): Promise<void>;

  // Payments
  getPayments(userId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
}

export class DatabaseStorage implements IStorage {
  // Customers
  async getCustomers(userId: string): Promise<Customer[]> {
    return await db.select().from(customers).where(eq(customers.userId, userId));
  }

  async getCustomer(userId: string, id: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.userId, userId), eq(customers.id, id)));
    return customer || undefined;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db
      .insert(customers)
      .values(customer)
      .returning();
    return newCustomer;
  }

  async updateCustomer(userId: string, id: string, customer: Partial<InsertCustomer>): Promise<Customer> {
    const [updated] = await db
      .update(customers)
      .set(customer)
      .where(and(eq(customers.userId, userId), eq(customers.id, id)))
      .returning();
    return updated;
  }

  async deleteCustomer(userId: string, id: string): Promise<void> {
    await db.delete(customers).where(and(eq(customers.userId, userId), eq(customers.id, id)));
  }

  async updateCustomerBalance(userId: string, customerId: string, delta: number): Promise<void> {
    const customer = await this.getCustomer(userId, customerId);
    if (customer) {
      const newBalance = parseFloat(customer.balance) + delta;
      await db
        .update(customers)
        .set({ balance: newBalance.toString() })
        .where(and(eq(customers.userId, userId), eq(customers.id, customerId)));
    }
  }

  // Products
  async getProducts(userId: string): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.userId, userId));
  }

  async getProduct(userId: string, id: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.userId, userId), eq(products.id, id)));
    return product || undefined;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db
      .insert(products)
      .values(product)
      .returning();
    return newProduct;
  }

  async updateProduct(userId: string, id: string, product: Partial<InsertProduct>): Promise<Product> {
    const [updated] = await db
      .update(products)
      .set(product)
      .where(and(eq(products.userId, userId), eq(products.id, id)))
      .returning();
    return updated;
  }

  async deleteProduct(userId: string, id: string): Promise<void> {
    await db.delete(products).where(and(eq(products.userId, userId), eq(products.id, id)));
  }

  async updateProductStock(userId: string, productId: string, delta: number): Promise<void> {
    const product = await this.getProduct(userId, productId);
    if (product) {
      const newStock = product.stock + delta;
      await db
        .update(products)
        .set({ stock: newStock })
        .where(and(eq(products.userId, userId), eq(products.id, productId)));
    }
  }

  // Invoices
  async getInvoices(userId: string): Promise<any[]> {
    const allInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt));

    const result = await Promise.all(
      allInvoices.map(async (invoice) => {
        const items = await db
          .select()
          .from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, invoice.id));
        
        return {
          ...invoice,
          items: items.map(item => ({
            ...item,
            rate: parseFloat(item.rate),
            amount: parseFloat(item.amount),
          })),
          subtotal: parseFloat(invoice.subtotal),
          tax: parseFloat(invoice.tax),
          total: parseFloat(invoice.total),
        };
      })
    );

    return result;
  }

  async getInvoice(userId: string, id: string): Promise<any | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.userId, userId), eq(invoices.id, id)));

    if (!invoice) return undefined;

    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoice.id));

    return {
      ...invoice,
      items: items.map(item => ({
        ...item,
        rate: parseFloat(item.rate),
        amount: parseFloat(item.amount),
      })),
      subtotal: parseFloat(invoice.subtotal),
      tax: parseFloat(invoice.tax),
      total: parseFloat(invoice.total),
    };
  }

  async createInvoice(invoice: InsertInvoice): Promise<any> {
    const { items: invoiceItemsData, ...invoiceData } = invoice;

    const [newInvoice] = await db
      .insert(invoices)
      .values(invoiceData)
      .returning();

    const createdItems = await db
      .insert(invoiceItems)
      .values(
        invoiceItemsData.map((item) => ({
          ...item,
          invoiceId: newInvoice.id,
        }))
      )
      .returning();

    return {
      ...newInvoice,
      items: createdItems.map(item => ({
        ...item,
        rate: parseFloat(item.rate),
        amount: parseFloat(item.amount),
      })),
      subtotal: parseFloat(newInvoice.subtotal),
      tax: parseFloat(newInvoice.tax),
      total: parseFloat(newInvoice.total),
    };
  }

  async updateInvoice(userId: string, id: string, invoice: Partial<InsertInvoice>): Promise<any> {
    const { items: invoiceItemsData, ...invoiceData } = invoice;

    const [updated] = await db
      .update(invoices)
      .set(invoiceData)
      .where(and(eq(invoices.userId, userId), eq(invoices.id, id)))
      .returning();

    if (invoiceItemsData) {
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

      await db
        .insert(invoiceItems)
        .values(
          invoiceItemsData.map((item) => ({
            ...item,
            invoiceId: id,
          }))
        );
    }

    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id));

    return {
      ...updated,
      items: items.map(item => ({
        ...item,
        rate: parseFloat(item.rate),
        amount: parseFloat(item.amount),
      })),
      subtotal: parseFloat(updated.subtotal),
      tax: parseFloat(updated.tax),
      total: parseFloat(updated.total),
    };
  }

  async deleteInvoice(userId: string, id: string): Promise<void> {
    await db.delete(invoices).where(and(eq(invoices.userId, userId), eq(invoices.id, id)));
  }

  // Payments
  async getPayments(userId: string): Promise<any[]> {
    const allPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
    
    return allPayments.map(payment => ({
      ...payment,
      amount: parseFloat(payment.amount),
    }));
  }

  async createPayment(payment: InsertPayment): Promise<any> {
    const [newPayment] = await db
      .insert(payments)
      .values(payment)
      .returning();
    
    return {
      ...newPayment,
      amount: parseFloat(newPayment.amount),
    };
  }
}

export const storage = new DatabaseStorage();
