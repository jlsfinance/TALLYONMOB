import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get('companyId');
  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');

  if (!companyId || !fromDate || !toDate) {
    return NextResponse.json({ error: 'companyId, fromDate, toDate required' }, { status: 400 });
  }

  const hasAccess = await validateCompanyAccess(user.userId, companyId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const from = new Date(fromDate);
  const to = new Date(toDate);

  // Get all ledgers grouped by type
  const ledgers = await db.ledger.findMany({
    where: { companyId, isDeleted: false },
  });

  // Calculate P&L from ledger balances
  let sales = 0;
  let purchases = 0;
  let directIncome = 0;
  let directExpense = 0;
  let indirectIncome = 0;
  let indirectExpense = 0;

  ledgers.forEach((l: any) => {
    const balance = Number(l.closingBalance);
    const type = (l.ledgerType || '').toLowerCase();
    const parent = l.parent.toLowerCase();

    if (type === 'sales' || parent.includes('sales')) {
      sales += Math.abs(balance);
    } else if (type === 'purchase' || parent.includes('purchase')) {
      purchases += Math.abs(balance);
    } else if (parent.includes('direct income') || parent.includes('direct-income')) {
      directIncome += Math.abs(balance);
    } else if (parent.includes('direct expense') || parent.includes('direct-expense')) {
      directExpense += Math.abs(balance);
    } else if (parent.includes('indirect income') || parent.includes('indirect-income')) {
      indirectIncome += Math.abs(balance);
    } else if (parent.includes('indirect expense') || parent.includes('indirect-expense')) {
      indirectExpense += Math.abs(balance);
    }
  });

  const grossProfit = sales + directIncome - purchases - directExpense;
  const netProfit = grossProfit + indirectIncome - indirectExpense;

  return NextResponse.json({
    success: true,
    data: {
      period: `${fromDate} to ${toDate}`,
      sales,
      purchases,
      directIncome,
      directExpense,
      indirectIncome,
      indirectExpense,
      grossProfit,
      netProfit,
      grossProfitPercent: sales > 0 ? ((grossProfit / sales) * 100).toFixed(2) : '0',
      netProfitPercent: sales > 0 ? ((netProfit / sales) * 100).toFixed(2) : '0',
    },
  });
});
