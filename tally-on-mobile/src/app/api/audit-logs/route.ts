import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest } from '@/lib/middleware';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const action = searchParams.get('action') || '';

  // Only admins/owners can view audit logs
  if (!['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const where: any = {};
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: logs,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});
