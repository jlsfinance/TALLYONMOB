import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { success, error, serverError, forbidden } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const voucherType = searchParams.get('type');
    const partyName = searchParams.get('party');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);

    if (!companyId) return error('companyId is required');

    const hasAccess = await canAccessCompany(user.userId, companyId);
    if (!hasAccess) return forbidden();

    const where: Record<string, unknown> = { companyId, isDeleted: false };
    if (voucherType) where.voucherType = voucherType;
    if (partyName) where.partyName = partyName;
    if (fromDate || toDate) {
      where.voucherDate = {};
      if (fromDate) (where.voucherDate as Record<string, unknown>).gte = new Date(fromDate);
      if (toDate) (where.voucherDate as Record<string, unknown>).lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { voucherNumber: { contains: search, mode: 'insensitive' } },
        { partyName: { contains: search, mode: 'insensitive' } },
        { narration: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [vouchers, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        orderBy: { voucherDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.voucher.count({ where }),
    ]);

    return success({
      items: vouchers,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    return serverError();
  }
}
