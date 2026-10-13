import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';
import { getVoucherAmount, isVoucherType } from '@/lib/voucher-utils';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get('companyId');
  const fromDate = searchParams.get('fromDate') || new Date(new Date().getFullYear(), 3, 1).toISOString().split('T')[0];
  const toDate = searchParams.get('toDate') || new Date(new Date().getFullYear() + 1, 2, 31).toISOString().split('T')[0];

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const hasAccess = await validateCompanyAccess(user.userId, companyId);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T23:59:59.999Z`);

  // Parallel queries for dashboard data
  const [
    totalLedgers,
    totalVouchers,
    totalStockItems,
    vouchersInPeriod,
    recentVouchers,
    lastSync,
  ] = await Promise.all([
    db.ledger.count({ where: { companyId, isDeleted: false } }),
    db.voucher.count({ where: { companyId, isDeleted: false, voucherDate: { gte: from, lte: to } } }),
    db.stockItem.count({ where: { companyId, isDeleted: false } }),
    db.voucher.findMany({
      where: { companyId, isDeleted: false, voucherDate: { gte: from, lte: to } },
      select: {
        voucherType: true,
        totalAmount: true,
        grandTotal: true,
        voucherDate: true,
        stockEntries: { select: { amount: true } },
        ledgerEntries: { select: { amount: true } },
      },
    }),
    db.voucher.findMany({
      where: { companyId, isDeleted: false },
      orderBy: { voucherDate: 'desc' },
      take: 10,
      include: {
        stockEntries: { select: { amount: true } },
        ledgerEntries: { select: { amount: true } },
      },
    }),
    db.syncHistory.findFirst({
      where: { companyId },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  const salesVouchers = vouchersInPeriod.filter((v: any) => isVoucherType(v.voucherType, 'sales'));
  const purchaseVouchers = vouchersInPeriod.filter((v: any) => isVoucherType(v.voucherType, 'purchase'));
  const totalSales = salesVouchers.reduce((sum: number, v: any) => sum + getVoucherAmount(v), 0);
  const totalPurchase = purchaseVouchers.reduce((sum: number, v: any) => sum + getVoucherAmount(v), 0);

  // Group by month for trends
  const salesByMonth = groupByMonth(salesVouchers);
  const purchaseByMonth = groupByMonth(purchaseVouchers);

  // Outstanding (receivables - payables)
  const receivableLedgers = await db.ledger.findMany({
    where: { companyId, ledgerType: 'Receivable', isDeleted: false },
    select: { closingBalance: true },
  });
  const payableLedgers = await db.ledger.findMany({
    where: { companyId, ledgerType: 'Payable', isDeleted: false },
    select: { closingBalance: true },
  });
  const receivables = receivableLedgers.reduce((s: number, l: any) => s + Math.max(0, Number(l.closingBalance)), 0);
  const payables = payableLedgers.reduce((s: number, l: any) => s + Math.abs(Math.min(0, Number(l.closingBalance))), 0);

  return NextResponse.json({
    success: true,
    data: {
      totalSales,
      totalPurchase,
      receivables,
      payables,
      cashBankBalance: 0, // calculated from Cash/Bank ledgers
      totalLedgers,
      totalVouchers,
      totalStockItems,
      recentVouchers: recentVouchers.map((voucher: any) => ({
        ...voucher,
        grandTotal: getVoucherAmount(voucher),
      })),
      salesTrend: salesByMonth,
      purchaseTrend: purchaseByMonth,
      lastSyncAt: lastSync?.completedAt || null,
    },
  });
});

function groupByMonth(vouchers: { totalAmount: any; grandTotal: any; voucherDate: Date }[]) {
  const map = new Map<string, number>();
  vouchers.forEach((v) => {
    const key = v.voucherDate.toISOString().slice(0, 7); // YYYY-MM
    map.set(key, (map.get(key) || 0) + getVoucherAmount(v));
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));
}
