/**
 * UPI Payment Link Service
 * Generates UPI payment links and QR codes for easy payment collection
 */

import QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export interface UPIPaymentDetails {
    upiId: string;            // merchant@upi
    payeeName: string;        // Merchant/Company name
    amount?: number;          // Optional amount
    transactionNote?: string; // Optional note
    transactionId?: string;   // Optional reference ID
    currency?: string;        // Default: INR
}

export interface UPILink {
    link: string;            // UPI deep link (upi://pay?...)
    qrDataUrl?: string;      // Base64 QR code image
    shortLink?: string;      // Short URL for sharing
}

class UPIPaymentService {

    /**
     * Generate UPI payment link
     */
    generateLink(details: UPIPaymentDetails): string {
        const params = new URLSearchParams();

        // Required parameters
        params.set('pa', details.upiId);                    // Payee address (UPI ID)
        params.set('pn', details.payeeName);                // Payee name

        // Optional parameters
        if (details.amount && details.amount > 0) {
            params.set('am', details.amount.toFixed(2));    // Amount
        }

        params.set('cu', details.currency || 'INR');        // Currency

        if (details.transactionNote) {
            params.set('tn', details.transactionNote);      // Transaction note
        }

        if (details.transactionId) {
            params.set('tr', details.transactionId);        // Transaction reference ID
        }

        return `upi://pay?${params.toString()}`;
    }

    /**
     * Generate UPI link with QR code
     */
    async generateWithQR(details: UPIPaymentDetails): Promise<UPILink> {
        const link = this.generateLink(details);

        let qrDataUrl: string | undefined;
        try {
            qrDataUrl = await QRCode.toDataURL(link, {
                margin: 2,
                width: 256,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF',
                },
            });
        } catch (error) {
            console.error('[UPIPaymentService] Failed to generate QR:', error);
        }

        return {
            link,
            qrDataUrl,
        };
    }

    /**
     * Generate payment link for invoice
     */
    async generateInvoicePaymentLink(params: {
        upiId: string;
        companyName: string;
        invoiceNumber: string;
        amount: number;
        customerName?: string;
    }): Promise<UPILink> {
        const note = `Payment for Invoice #${params.invoiceNumber}${params.customerName ? ` by ${params.customerName}` : ''}`;

        return this.generateWithQR({
            upiId: params.upiId,
            payeeName: params.companyName,
            amount: params.amount,
            transactionNote: note,
            transactionId: `INV-${params.invoiceNumber}`,
        });
    }

    /**
     * Generate generic payment request link
     */
    async generatePaymentRequestLink(params: {
        upiId: string;
        companyName: string;
        amount?: number;
        note?: string;
    }): Promise<UPILink> {
        return this.generateWithQR({
            upiId: params.upiId,
            payeeName: params.companyName,
            amount: params.amount,
            transactionNote: params.note || `Payment to ${params.companyName}`,
        });
    }

    /**
     * Share UPI link via native share
     */
    async shareLink(upiLink: UPILink, message: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            // Web fallback - copy to clipboard
            try {
                await navigator.clipboard.writeText(upiLink.link);
                return true;
            } catch {
                return false;
            }
        }

        try {
            await Share.share({
                title: 'Payment Link',
                text: message,
                url: upiLink.link,
            });
            return true;
        } catch (error) {
            console.error('[UPIPaymentService] Share failed:', error);
            return false;
        }
    }

    /**
     * Generate WhatsApp message with payment link
     */
    generateWhatsAppMessage(params: {
        customerName: string;
        companyName: string;
        amount: number;
        invoiceNumber?: string;
        upiLink: string;
    }): string {
        const lines = [
            `🙏 नमस्ते ${params.customerName} जी,`,
            ``,
            `${params.companyName} की तरफ से,`,
            params.invoiceNumber
                ? `Invoice #${params.invoiceNumber} के लिए ₹${params.amount.toLocaleString('en-IN')} का भुगतान pending है।`
                : `कुल ₹${params.amount.toLocaleString('en-IN')} का भुगतान pending है।`,
            ``,
            `💳 *UPI से तुरंत pay करें:*`,
            params.upiLink,
            ``,
            `या QR code scan करें। 🙏`,
            ``,
            `धन्यवाद! 🙂`,
        ];

        return lines.join('\n');
    }

    /**
     * Open WhatsApp with payment link
     */
    async shareViaWhatsApp(phone: string, params: {
        customerName: string;
        companyName: string;
        amount: number;
        invoiceNumber?: string;
        upiLink: string;
    }): Promise<void> {
        const message = this.generateWhatsAppMessage(params);
        const encodedMessage = encodeURIComponent(message);

        // Clean phone number
        let cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone.startsWith('91') && cleanPhone.length === 10) {
            cleanPhone = '91' + cleanPhone;
        }

        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

        if (Capacitor.isNativePlatform()) {
            window.open(whatsappUrl, '_system');
        } else {
            window.open(whatsappUrl, '_blank');
        }
    }

    /**
     * Validate UPI ID format
     */
    isValidUPIId(upiId: string): boolean {
        // UPI ID format: username@bankcode
        const upiRegex = /^[\w.\-]+@[\w]+$/;
        return upiRegex.test(upiId);
    }
}

// Export singleton instance
export const upiPaymentService = new UPIPaymentService();
export default upiPaymentService;
