import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { success, error, serverError, forbidden } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const partyName = searchParams.get('party');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    if (!companyId) return error('companyId is required');
    if (!partyName) return error('party name is required');

    const hasAccess = await canAccessCompany(user.userId, companyId);
    if (!hasAccess) return forbidden();

    // Get ledger opening balance
    const ledger = await prisma.ledger.findFirst({
      where: { companyId, name: { contains: partyName, mode: 'insensitive' } },
    });

    const openingBalance = ledger ? Number(ledger.openingBalance) : 0;

    // Get all vouchers for this party
    const where: Record<string, unknown> = {
      companyId,
      partyName: { contains: partyName, mode: 'insensitive' },
      isDeleted: false,
    };
    if (fromDate || toDate) {
      where.voucherDate = {};
      if (fromDate) (where.voucherDate as Record<string, unknown>).gte = new Date(fromDate);
      if (toDate) (where.voucherDate as Record<string, unknown>).lte = new Date(toDate);
    }

    const vouchers = await prisma.voucher.findMany({
      where,
      include: { ledgerEntries: true },
      orderBy: { voucherDate: 'asc' },
    });

    // Calculate running balance
    let running = openingBalance;
    const entries = vouchers.map((v: any) => {
      const amount = Math.abs(Number(v.grandTotal));
      const isDebit = ['Sales', 'Sales Invoice', 'Payment', 'Debit Note', 'Journal'].includes(v.voucherType);
      const signedAmount = isDebit ? amount : -amount;
      running += signedAmount;

      return {
        id: v.id,
        date: v.voucherDate,
        voucherNumber: v.voucherNumber,
        voucherType: v.voucherType,
        narration: v.narration,
        debit: isDebit ? amount : 0,
        credit: isDebit ? 0 : amount,
        runningBalance: running,
      };
    });

    return success({
      ledger,
      openingBalance,
      entries,
      closingBalance: running,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    return serverError();
  }
}
