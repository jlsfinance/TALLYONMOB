import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { success, error, serverError, forbidden } from '@/lib/api-response';
import { hashPassword } from '@/lib/auth';

export async function GET() {
  try {
    const user = await requireRole('SUPER_ADMIN', 'ADMIN');

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        companyUsers: {
          include: { company: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return success(users);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    if (e instanceof Error && e.message === 'Forbidden') return forbidden();
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('SUPER_ADMIN', 'ADMIN');

    const body = await req.json();
    const { name, email, password, role } = body;

    if (!name || !email || !password) {
      return error('Name, email, and password are required');
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return error('Email already registered');

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        role: role || 'VIEWER',
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    return success(user, 201);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'Unauthorized') return error('Unauthorized', 401);
    if (e instanceof Error && e.message === 'Forbidden') return forbidden();
    return serverError();
  }
}
