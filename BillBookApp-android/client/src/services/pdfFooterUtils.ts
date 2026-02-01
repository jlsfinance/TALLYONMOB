/**
 * Branded Footer Watermark Utility for All PDFs
 * Adds a premium, stylish footer to invoices, ledgers, and reports
 */

import { jsPDF } from 'jspdf';

export interface FooterOptions {
    showDisclaimer?: boolean;
    customTagline?: string;
}

/**
 * Adds a premium branded footer to any jsPDF document
 * Call this AFTER all content is rendered, before saving/sharing
 */
export const addBrandedFooter = (doc: jsPDF, options?: FooterOptions) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    // Footer starts 15mm from bottom
    let footerY = pageHeight - 15;

    // ═══════════════════════════════════════════════════════════
    // 1. SUBTLE LINE SEPARATOR
    // ═══════════════════════════════════════════════════════════
    doc.setDrawColor(220, 220, 220); // Light gray
    doc.setLineWidth(0.3);
    doc.line(40, footerY, pageWidth - 40, footerY);

    footerY += 4;

    // ═══════════════════════════════════════════════════════════
    // 2. DISCLAIMER (Small, subtle - comes first)
    // ═══════════════════════════════════════════════════════════
    if (options?.showDisclaimer !== false) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(160, 160, 160); // Muted gray
        doc.text('This is a computer-generated document for record-keeping purposes only.', centerX, footerY, { align: 'center' });
        footerY += 4;
    }

    // ═══════════════════════════════════════════════════════════
    // 3. AESTHETIC BRANDING - "Made with Love by JLS BILL APP"
    // ═══════════════════════════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(59, 130, 246); // Blue
    doc.text('Made with Love by JLS BILL APP', centerX, footerY, { align: 'center' });

    // Reset colors
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
};

/**
 * Get the height reserved for the footer (use for page break calculations)
 */
export const getFooterHeight = (): number => {
    return 18; // mm
};
