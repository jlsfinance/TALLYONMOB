import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const hasAccess = await validateCompanyAccess(user.userId, companyId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const ledgers = await db.ledger.findMany({
    where: { companyId, isDeleted: false },
    orderBy: [{ parent: 'asc' }, { name: 'asc' }],
  });

  let totalDebit = 0;
  let totalCredit = 0;

  const rows = ledgers
    .filter((l: any) => Number(l.closingBalance) !== 0)
    .map((l: any) => {
      const balance = Number(l.closingBalance);
      const debit = balance > 0 ? balance : 0;
      const credit = balance < 0 ? Math.abs(balance) : 0;
      totalDebit += debit;
      totalCredit += credit;
      return {
        ledgerName: l.name,
        group: l.parent,
        debit,
        credit,
      };
    });

  return NextResponse.json({
    success: true,
    data: {
      rows,
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
    },
  });
});
