import { Invoice, Payment, CompanyProfile, Customer } from '../types';
import { AIService } from './aiService';

export const WhatsAppService = {
  shareInvoice: async (invoice: Invoice, customer: Customer | undefined, company: CompanyProfile, manualPhoneNumber?: string) => {
    let phone = (manualPhoneNumber || customer?.phone || '').replace(/\D/g, '');

    if (!phone) {
      return alert("Please provide a mobile number.");
    }

    if (phone.length < 10) return alert("Please enter a valid 10-digit mobile number.");

    const itemsSummary = invoice.items.map(i =>
      `- ${i.description} - ${i.quantity} x ₹${i.rate.toFixed(2)} = ₹${(i.totalAmount || 0).toFixed(2)}`
    ).join('%0A');

    // Simulated Links (Would be real URLs in a hosted app)
    const invoiceLink = `https://git-import.vercel.app/view/${invoice.id}`;
    const ledgerLink = customer ? `https://git-import.vercel.app/customer/${customer.id}/ledger` : '';

    const message = `*TAX INVOICE*\n` +
      `*${company.name}*\n\n` +
      `Hello ${customer?.company || customer?.name || 'Customer'},\n` +
      `Here are your invoice details:\n\n` +
      `*Inv No:* ${invoice.invoiceNumber}\n` +
      `*Date:* ${invoice.date}\n` +
      `*Bill Amount:* Rs. ${invoice.total.toFixed(2)}\n` +
      (invoice.previousBalance && invoice.previousBalance > 0 ? `*Prev. Balance:* Rs. ${invoice.previousBalance.toFixed(2)}\n` : '') +
      (invoice.previousBalance && invoice.previousBalance > 0 ? `*Net Total Due:* Rs. ${(invoice.total + invoice.previousBalance).toFixed(2)}\n` : '') +
      `*Status:* ${invoice.status === 'PAID' ? 'PAID ✅' : 'PENDING ⏳'}\n\n` +
      `*Items:*\n${itemsSummary.replace(/%0A/g, '\n')}\n\n` +
      `📄 *View Invoice:* ${invoiceLink}\n` +
      `📒 *View Ledger:* ${customer ? ledgerLink : 'N/A'}\n\n` +
      `Thank you for your business!`;

    // AI Translation if configured
    let finalMessage = message;
    const lang = company.invoiceSettings?.language || 'English';
    if (lang !== 'English' && AIService.isConfigured()) {
      try {
        finalMessage = await AIService.translateContent(message, lang as any);
      } catch (e) {
        console.error("WhatsApp AI translation failed", e);
      }
    }

    if (confirm(`Share invoice via WhatsApp to +91 ${phone}?`)) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(finalMessage)}`, '_blank');
    }
  },

  sharePayment: async (payment: Payment, customer: Customer | undefined, company: CompanyProfile, manualPhoneNumber?: string) => {
    if (!customer) return alert("Customer data not found.");

    const phone = (manualPhoneNumber || customer.phone || '').replace(/\D/g, '');
    if (!phone) return alert("Please provide a mobile number.");

    const ledgerLink = `https://git-import.vercel.app/customer/${customer.id}/ledger`;

    const message = `*PAYMENT RECEIPT*\n` +
      `*${company.name}*\n\n` +
      `Hello ${customer.company || customer.name},\n` +
      `We have received your payment.\n\n` +
      `*Amount:* Rs. ${payment.amount.toFixed(2)}\n` +
      `*Date:* ${payment.date}\n` +
      `*Mode:* ${payment.mode}\n` +
      `*Ref:* ${payment.reference || 'N/A'}\n\n` +
      `*Current Balance:* Rs. ${customer.balance.toFixed(2)}\n\n` +
      `📒 *View Ledger:* ${ledgerLink}\n\n` +
      `Thank you!`;

    // AI Translation if configured
    let finalMessage = message;
    const lang = company.invoiceSettings?.language || 'English';
    if (lang !== 'English' && AIService.isConfigured()) {
      try {
        finalMessage = await AIService.translateContent(message, lang as any);
      } catch (e) {
        console.error("WhatsApp AI translation failed", e);
      }
    }

    if (confirm(`Share payment receipt via WhatsApp to +91 ${phone}?`)) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(finalMessage)}`, '_blank');
    }
  }
};
