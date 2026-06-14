import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get('companyId');
  const type = searchParams.get('type') || 'receivable'; // receivable, payable

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const hasAccess = await validateCompanyAccess(user.userId, companyId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const ledgerType = type === 'receivable' ? 'Receivable' : 'Payable';

  const ledgers = await db.ledger.findMany({
    where: {
      companyId,
      isDeleted: false,
      ledgerType,
      closingBalance: { not: 0 },
    },
    orderBy: { closingBalance: 'desc' },
  });

  // Get last transaction date for each ledger
  const outstanding = await Promise.all(
    ledgers.map(async (l: any) => {
      const lastEntry = await db.voucherLedgerEntry.findFirst({
        where: { companyId, ledgerName: l.name },
        include: { voucher: { select: { voucherDate: true } } },
        orderBy: { voucher: { voucherDate: 'desc' } },
      });

      const balance = Number(l.closingBalance);
      const outstandingAmount = type === 'receivable' ? Math.max(0, balance) : Math.abs(Math.min(0, balance));
      const lastDate = lastEntry?.voucher?.voucherDate;
      const overdueDays = lastDate
        ? Math.max(0, Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      return {
        partyName: l.name,
        ledgerType: l.ledgerType,
        outstandingAmount,
        overdueDays,
        lastTransactionDate: lastDate || null,
        phone: l.phone,
        gstin: l.gstin,
      };
    })
  );

  const filtered = outstanding.filter((o: any) => o.outstandingAmount > 0);
  const totalOutstanding = filtered.reduce((s: number, o: any) => s + o.outstandingAmount, 0);

  return NextResponse.json({
    success: true,
    data: {
      type,
      totalOutstanding,
      totalParties: filtered.length,
      items: filtered.sort((a: any, b: any) => b.outstandingAmount - a.outstandingAmount),
    },
  });
});
