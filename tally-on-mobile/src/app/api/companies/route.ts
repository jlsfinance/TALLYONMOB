import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { success, error, serverError } from '@/lib/api-response';

interface CompanyWithSyncHistory {
  id: string;
  name: string;
  gstin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  financialYearStart: Date | null;
  booksBeginDate: Date | null;
  tallyGuid: string | null;
  tallyCompany: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { ledgers: number; vouchers: number; stockItems: number };
  syncHistory: Array<{ completedAt: Date | null }>;
}

interface CompanyUserWithSyncHistory {
  role: string;
  company: CompanyWithSyncHistory;
}

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
            syncHistory: {
              where: { status: 'COMPLETED', completedAt: { not: null } },
              orderBy: { completedAt: 'desc' },
              take: 1,
              select: { completedAt: true },
            },
          },
        },
      },
    });

    const companies = (companyUsers as unknown as CompanyUserWithSyncHistory[]).map(({ company, role }) => {
      const { syncHistory, _count, ...companyData } = company;
      return {
        ...companyData,
        role,
        counts: _count,
        lastSyncedAt: syncHistory[0]?.completedAt ?? null,
      };
    });

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
