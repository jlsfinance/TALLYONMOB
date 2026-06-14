import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type AuthenticatedRequest, validateCompanyAccess } from '@/lib/middleware';
import crypto from 'crypto';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get('companyId');

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const hasAccess = await validateCompanyAccess(user.userId, companyId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const devices = await db.device.findMany({
    where: { companyId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ success: true, data: devices });
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const user = req.user!;
  const { companyId, deviceName, deviceFingerprint, tallyVersion, osVersion } = await req.json();

  if (!companyId || !deviceName || !deviceFingerprint) {
    return NextResponse.json({ error: 'companyId, deviceName, deviceFingerprint required' }, { status: 400 });
  }

  const hasAccess = await validateCompanyAccess(user.userId, companyId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Check if device already exists
  const existing = await db.device.findUnique({ where: { deviceFingerprint } });
  if (existing) {
    // Update and return
    const updated = await db.device.update({
      where: { id: existing.id },
      data: { deviceName, tallyVersion, osVersion, lastSeenAt: new Date() },
    });
    return NextResponse.json({ success: true, data: updated });
  }

  const apiKey = `tom_${crypto.randomBytes(32).toString('hex')}`;

  const device = await db.device.create({
    data: {
      userId: user.userId,
      companyId,
      deviceName,
      deviceFingerprint,
      apiKey,
      tallyVersion,
      osVersion,
    },
  });

  return NextResponse.json({ success: true, data: device });
});
