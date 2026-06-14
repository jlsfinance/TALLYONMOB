import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  const user = req.user!;
  const params = await context!.params;
  const ledgerId = params.id;

  const ledger = await db.ledger.findUnique({
    where: { id: ledgerId },
    include: { company: { select: { id: true } } },
  });

  if (!ledger) {
    return NextResponse.json({ error: 'Ledger not found' }, { status: 404 });
  }

  const hasAccess = await validateCompanyAccess(user.userId, ledger.companyId);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Get recent voucher entries for this ledger
  const recentEntries = await db.voucherLedgerEntry.findMany({
    where: { companyId: ledger.companyId, ledgerName: ledger.name },
    include: { voucher: { select: { id: true, voucherNumber: true, voucherType: true, voucherDate: true, partyName: true, totalAmount: true } } },
    orderBy: { voucher: { voucherDate: 'desc' } },
    take: 50,
  });

  return NextResponse.json({
    success: true,
    data: {
      ...ledger,
      recentEntries: recentEntries.map((e: any) => ({
        id: e.id,
        amount: e.amount,
        isDebit: e.isDebit,
        voucher: e.voucher,
      })),
    },
  });
});
