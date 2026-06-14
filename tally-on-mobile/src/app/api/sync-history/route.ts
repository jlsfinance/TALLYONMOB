import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get('companyId');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const hasAccess = await validateCompanyAccess(user.userId, companyId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const [history, total] = await Promise.all([
    db.syncHistory.findMany({
      where: { companyId },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.syncHistory.count({ where: { companyId } }),
  ]);

  return NextResponse.json({
    success: true,
    data: history,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});
