import { Capacitor, registerPlugin } from '@capacitor/core';
import type { jsPDF } from 'jspdf';

const PdfDownload = registerPlugin<{ save(options: { filename: string; data: string }): Promise<void> }>('PdfDownload');

export async function savePdf(doc: jsPDF, filename: string) {
    if (Capacitor.getPlatform() !== 'android') { doc.save(filename); return; }
    const data = doc.output('datauristring').split(',')[1];
    if (!data) throw new Error('Unable to create PDF');
    await PdfDownload.save({ filename, data });
}
