import type { InvoiceDraft } from './types';

function capture(text: string, regex: RegExp, groupIndex = 1) {
    const match = text.match(regex);
    if (!match) return '';
    return String(match[groupIndex] || '').trim();
}

function captureAmount(text: string, regex: RegExp) {
    const raw = capture(text, regex, 2) || capture(text, regex, 1);
    const cleaned = raw.replace(/,/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function extractInvoiceFields(text: string): InvoiceDraft {
    const gstinFromRegex = capture(text, /(GSTIN|GST\s*IN|GST\s*No\.?|GST\s*Number)\s*[:#-]?\s*([0-9A-Z]{15})/i, 2)
        || capture(text, /([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/i, 1);

    const invoiceNumber = capture(text, /(invoice\s*(no\.?|number))\s*[:#-]?\s*([A-Z0-9\/-]+)/i, 3)
        || capture(text, /(bill\s*(no\.?|number))\s*[:#-]?\s*([A-Z0-9\/-]+)/i, 3);

    const date = capture(text, /(invoice\s*date|date)\s*[:#-]?\s*([0-3]?\d[\/-][01]?\d[\/-]\d{2,4})/i, 2);

    const taxableValue = captureAmount(text, /(taxable\s*(value|amount)|assessable\s*value)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const cgst = captureAmount(text, /(CGST)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const sgst = captureAmount(text, /(SGST)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const igst = captureAmount(text, /(IGST)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const hsn = capture(text, /(HSN(?:\s*CODE)?)\s*[:#-]?\s*([A-Z0-9]+)/i, 2);

    const gstin = String(gstinFromRegex || '').toUpperCase();

    return {
        gstin,
        invoiceNumber,
        date,
        taxableValue,
        cgst,
        sgst,
        igst,
        hsn,
        invoiceType: gstin ? 'B2B' : 'B2C'
    };
}

export async function extractInvoiceFromPdfLocal(file: File) {
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
        data: uint8,
        disableWorker: true
    });

    const document = await loadingTask.promise;
    const chunks: string[] = [];

    for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
        const page = await document.getPage(pageNo);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items || [])
            .map((item: any) => String(item.str || ''))
            .join(' ');
        chunks.push(pageText);
    }

    const fullText = chunks.join(' ').replace(/\s+/g, ' ').trim();

    return {
        extracted: extractInvoiceFields(fullText),
        rawTextPreview: fullText.slice(0, 4000)
    };
}
