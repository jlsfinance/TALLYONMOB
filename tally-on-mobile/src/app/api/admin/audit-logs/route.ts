import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { success, error, serverError, forbidden } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    await requireRole('SUPER_ADMIN', 'ADMIN');

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const entity = searchParams.get('entity');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (entity) where.entity = entity;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return success({
      items: logs,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    if (e instanceof Error && e.message === 'Forbidden') return forbidden();
    return serverError();
  }
}
