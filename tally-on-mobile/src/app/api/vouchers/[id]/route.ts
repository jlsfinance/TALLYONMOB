import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { success, error, serverError, notFound, forbidden } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const voucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        ledgerEntries: true,
        stockEntries: true,
      },
    });

    if (!voucher) return notFound('Voucher not found');

    const hasAccess = await canAccessCompany(user.userId, voucher.companyId);
    if (!hasAccess) return forbidden();

    return success(voucher);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    return serverError();
  }
}
