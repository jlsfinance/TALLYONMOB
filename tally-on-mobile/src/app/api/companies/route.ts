import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { success, error, serverError, forbidden } from '@/lib/api-response';

export async function GET() {
  try {
    const user = await requireAuth();
    const companyUsers = await prisma.companyUser.findMany({
      where: { userId: user.userId },
      include: {
        company: {
          include: {
            _count: {
              select: {
                ledgers: true,
                vouchers: true,
                stockItems: true,
              },
            },
          },
        },
      },
    });

    const companies = companyUsers.map((cu: any) => ({
      ...cu.company,
      role: cu.role,
      counts: cu.company._count,
    }));

    return success(companies);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return error('Unauthorized', 401);
    }
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { name, gstin, address, city, state, pincode, phone, email } = body;

    if (!name) return error('Company name is required');

    const company = await prisma.company.create({
      data: {
        name: name.trim(),
        gstin: gstin?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        pincode: pincode?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
      },
    });

    // Add current user as owner
    await prisma.companyUser.create({
      data: {
        userId: user.userId,
        companyId: company.id,
        role: 'OWNER',
      },
    });

    // Create free subscription
    await prisma.subscription.create({
      data: {
        companyId: company.id,
        plan: 'FREE',
        status: 'ACTIVE',
      },
    });

    return success(company, 201);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return error('Unauthorized', 401);
    }
    console.error('Create company error:', e);
    return serverError();
  }
}
