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
  });

  const assets: { name: string; group: string; amount: number }[] = [];
  const liabilities: { name: string; group: string; amount: number }[] = [];

  ledgers.forEach((l: any) => {
    const balance = Number(l.closingBalance);
    const parent = l.parent.toLowerCase();

    if (parent.includes('asset') || parent.includes('fixed asset') || parent.includes('current asset') ||
        parent.includes('bank') || parent.includes('cash') || parent.includes('stock') ||
        parent.includes('debtor') || parent.includes('receivable')) {
      if (balance !== 0) {
        assets.push({ name: l.name, group: l.parent, amount: Math.abs(balance) });
      }
    } else if (parent.includes('liabilit') || parent.includes('capital') || parent.includes('reserve') ||
               parent.includes('creditor') || parent.includes('payable') || parent.includes('provision')) {
      if (balance !== 0) {
        liabilities.push({ name: l.name, group: l.parent, amount: Math.abs(balance) });
      }
    }
  });

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);

  return NextResponse.json({
    success: true,
    data: {
      assets: assets.sort((a, b) => b.amount - a.amount),
      liabilities: liabilities.sort((a, b) => b.amount - a.amount),
      totalAssets,
      totalLiabilities,
      difference: totalAssets - totalLiabilities,
    },
  });
});
