import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  const user = req.user!;
  const params = await context!.params;
  const itemId = params.id;

  const item = await db.stockItem.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: 'Stock item not found' }, { status: 404 });

  const hasAccess = await validateCompanyAccess(user.userId, item.companyId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Get stock movement history
  const movements = await db.voucherStockEntry.findMany({
    where: { companyId: item.companyId, stockItemName: item.name },
    include: { voucher: { select: { id: true, voucherNumber: true, voucherType: true, voucherDate: true, partyName: true } } },
    orderBy: { voucher: { voucherDate: 'desc' } },
    take: 100,
  });

  return NextResponse.json({ success: true, data: { ...item, movements } });
});
