import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { success, error, serverError, forbidden } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) return error('companyId is required');

    const hasAccess = await canAccessCompany(user.userId, companyId);
    if (!hasAccess) return forbidden();

    // Fetch counts and summary data
    const [ledgerCount, voucherCount, stockCount, vouchers, recentVouchers] = await Promise.all([
      prisma.ledger.count({ where: { companyId } }),
      prisma.voucher.count({ where: { companyId, isDeleted: false } }),
      prisma.stockItem.count({ where: { companyId, isActive: true } }),
      prisma.voucher.findMany({
        where: { companyId, isDeleted: false },
        select: { voucherType: true, grandTotal: true },
      }),
      prisma.voucher.findMany({
        where: { companyId, isDeleted: false },
        orderBy: { voucherDate: 'desc' },
        take: 10,
        select: {
          id: true,
          voucherNumber: true,
          voucherType: true,
          voucherDate: true,
          partyName: true,
          grandTotal: true,
        },
      }),
    ]);

    // Calculate totals
    let totalSales = 0;
    let totalPurchase = 0;
    for (const v of vouchers) {
      const amount = Math.abs(Number(v.grandTotal));
      if (v.voucherType === 'Sales') totalSales += amount;
      if (v.voucherType === 'Purchase') totalPurchase += amount;
    }

    // Get cash/bank balance and receivables/payables from ledgers
    const ledgers = await prisma.ledger.findMany({
      where: { companyId },
      select: { parent: true, closingBalance: true, ledgerType: true },
    });

    let cashBankBalance = 0;
    let receivables = 0;
    let payables = 0;

    for (const l of ledgers) {
      const balance = Number(l.closingBalance);
      const parent = (l.parent || '').toLowerCase();
      if (parent.includes('cash') || parent.includes('bank')) {
        cashBankBalance += balance;
      }
      if (parent.includes('sundry debtor') || l.ledgerType === 'Receivable') {
        receivables += Math.abs(balance);
      }
      if (parent.includes('sundry creditor') || l.ledgerType === 'Payable') {
        payables += Math.abs(balance);
      }
    }

    return success({
      totalSales,
      totalPurchase,
      cashBankBalance,
      receivables,
      payables,
      ledgerCount,
      voucherCount,
      stockCount,
      recentVouchers,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    console.error('Reports error:', e);
    return serverError();
  }
}
