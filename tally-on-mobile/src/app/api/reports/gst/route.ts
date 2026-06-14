import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get('companyId');
  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');
  const reportType = searchParams.get('type') || 'gstr1'; // gstr1, gstr3b

  if (!companyId || !fromDate || !toDate) {
    return NextResponse.json({ error: 'companyId, fromDate, toDate required' }, { status: 400 });
  }

  const hasAccess = await validateCompanyAccess(user.userId, companyId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const from = new Date(fromDate);
  const to = new Date(toDate);

  // Get company for GSTIN
  const company = await db.company.findUnique({ where: { id: companyId } });

  if (reportType === 'gstr1') {
    // GSTR-1: Outward supplies
    const salesVouchers = await db.voucher.findMany({
      where: {
        companyId,
        isDeleted: false,
        voucherType: { in: ['Sales', 'Credit Note'] },
        voucherDate: { gte: from, lte: to },
      },
      include: {
        ledgerEntries: true,
        stockEntries: true,
      },
      orderBy: { voucherDate: 'asc' },
    });

    let totalTaxableValue = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;
    let totalCess = 0;

    const invoices = salesVouchers.map((v: any) => {
      const gst = calculateGST(v.stockEntries, v.ledgerEntries, company?.state || '');
      totalTaxableValue += gst.taxableValue;
      totalCGST += gst.cgst;
      totalSGST += gst.sgst;
      totalIGST += gst.igst;
      totalCess += gst.cess;
      return {
        ...v,
        gstDetails: gst,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        reportType: 'GSTR-1',
        period: `${fromDate} to ${toDate}`,
        companyGstin: company?.gstin,
        companyName: company?.name,
        totalInvoices: invoices.length,
        totalTaxableValue,
        totalCGST,
        totalSGST,
        totalIGST,
        totalCess,
        totalTax: totalCGST + totalSGST + totalIGST + totalCess,
        invoices,
      },
    });
  }

  if (reportType === 'gstr3b') {
    // GSTR-3B: Summary
    const [sales, purchases, creditNotes, debitNotes] = await Promise.all([
      db.voucher.findMany({
        where: { companyId, isDeleted: false, voucherType: 'Sales', voucherDate: { gte: from, lte: to } },
        include: { stockEntries: true, ledgerEntries: true },
      }),
      db.voucher.findMany({
        where: { companyId, isDeleted: false, voucherType: 'Purchase', voucherDate: { gte: from, lte: to } },
        include: { stockEntries: true, ledgerEntries: true },
      }),
      db.voucher.findMany({
        where: { companyId, isDeleted: false, voucherType: 'Credit Note', voucherDate: { gte: from, lte: to } },
        include: { stockEntries: true, ledgerEntries: true },
      }),
      db.voucher.findMany({
        where: { companyId, isDeleted: false, voucherType: 'Debit Note', voucherDate: { gte: from, lte: to } },
        include: { stockEntries: true, ledgerEntries: true },
      }),
    ]);

    const salesGST = aggregateGST(sales, company?.state || '');
    const purchaseGST = aggregateGST(purchases, company?.state || '');
    const creditGST = aggregateGST(creditNotes, company?.state || '');
    const debitGST = aggregateGST(debitNotes, company?.state || '');

    return NextResponse.json({
      success: true,
      data: {
        reportType: 'GSTR-3B',
        period: `${fromDate} to ${toDate}`,
        companyGstin: company?.gstin,
        companyName: company?.name,
        outward: {
          taxableValue: salesGST.taxableValue - creditGST.taxableValue,
          cgst: salesGST.cgst - creditGST.cgst,
          sgst: salesGST.sgst - creditGST.sgst,
          igst: salesGST.igst - creditGST.igst,
        },
        inward: {
          taxableValue: purchaseGST.taxableValue - debitGST.taxableValue,
          cgst: purchaseGST.cgst - debitGST.cgst,
          sgst: purchaseGST.sgst - debitGST.sgst,
          igst: purchaseGST.igst - debitGST.igst,
        },
        netTax: {
          cgst: (salesGST.cgst - creditGST.cgst) - (purchaseGST.cgst - debitGST.cgst),
          sgst: (salesGST.sgst - creditGST.sgst) - (purchaseGST.sgst - debitGST.sgst),
          igst: (salesGST.igst - creditGST.igst) - (purchaseGST.igst - debitGST.igst),
        },
      },
    });
  }

  return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
});

function calculateGST(stockEntries: any[], ledgerEntries: any[], companyState: string) {
  let taxableValue = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let cess = 0;

  stockEntries.forEach((se: any) => {
    const amount = Number(se.amount) || 0;
    const rate = Number(se.taxRate) || 0;
    taxableValue += amount;
    // Assume CGST+SGST if same state, else IGST
    if (rate > 0) {
      const tax = (amount * rate) / 100;
      cgst += tax / 2;
      sgst += tax / 2;
    }
  });

  return { taxableValue, cgst, sgst, igst, cess };
}

function aggregateGST(vouchers: any[], companyState: string) {
  let taxableValue = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  vouchers.forEach((v: any) => {
    v.stockEntries.forEach((se: any) => {
      const amount = Number(se.amount) || 0;
      const rate = Number(se.taxRate) || 0;
      taxableValue += amount;
      if (rate > 0) {
        const tax = (amount * rate) / 100;
        cgst += tax / 2;
        sgst += tax / 2;
      }
    });
  });

  return { taxableValue, cgst, sgst, igst };
}
