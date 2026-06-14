import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Webhook endpoint for desktop connector - no JWT required, API key only
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    const device = await db.device.findUnique({
      where: { apiKey },
    });

    if (!device || !device.isActive) {
      return NextResponse.json({ error: 'Invalid device' }, { status: 401 });
    }

    await db.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: { status: 'ok', deviceId: device.id, companyId: device.companyId },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
