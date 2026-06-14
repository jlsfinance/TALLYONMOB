import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { success, error, serverError, forbidden } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const parent = searchParams.get('parent');
    const search = searchParams.get('search');
    const ledgerType = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);

    if (!companyId) return error('companyId is required');

    const hasAccess = await canAccessCompany(user.userId, companyId);
    if (!hasAccess) return forbidden();

    const where: Record<string, unknown> = { companyId };
    if (parent) where.parent = parent;
    if (ledgerType) where.ledgerType = ledgerType;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { alias: { contains: search, mode: 'insensitive' } },
        { gstin: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [ledgers, total] = await Promise.all([
      prisma.ledger.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ledger.count({ where }),
    ]);

    return success({
      items: ledgers,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    return serverError();
  }
}
