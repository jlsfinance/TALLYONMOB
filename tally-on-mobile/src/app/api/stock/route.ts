import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { success, error, serverError, forbidden } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const stockGroup = searchParams.get('group');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);

    if (!companyId) return error('companyId is required');

    const hasAccess = await canAccessCompany(user.userId, companyId);
    if (!hasAccess) return forbidden();

    const where: Record<string, unknown> = { companyId, isActive: true };
    if (stockGroup) where.stockGroup = stockGroup;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { alias: { contains: search, mode: 'insensitive' } },
        { hsnCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.stockItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockItem.count({ where }),
    ]);

    return success({
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    return serverError();
  }
}
