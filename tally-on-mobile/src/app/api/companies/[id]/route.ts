import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { success, error, serverError, notFound, forbidden } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const hasAccess = await canAccessCompany(user.userId, id);
    if (!hasAccess) return forbidden();

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: { ledgers: true, vouchers: true, stockItems: true },
        },
      },
    });

    if (!company) return notFound('Company not found');
    return success(company);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    return serverError();
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const hasAccess = await canAccessCompany(user.userId, id);
    if (!hasAccess) return forbidden();

    const body = await req.json();
    const { name, gstin, address, city, state, pincode, phone, email } = body;

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(gstin !== undefined && { gstin: gstin?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(city !== undefined && { city: city?.trim() || null }),
        ...(state !== undefined && { state: state?.trim() || null }),
        ...(pincode !== undefined && { pincode: pincode?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
      },
    });

    return success(company);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const cu = await prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: user.userId, companyId: id } },
    });

    if (!cu || !['OWNER', 'ADMIN'].includes(cu.role)) {
      return forbidden('Only owner or admin can delete company');
    }

    await prisma.company.delete({ where: { id } });
    return success({ message: 'Company deleted' });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    return serverError();
  }
}
