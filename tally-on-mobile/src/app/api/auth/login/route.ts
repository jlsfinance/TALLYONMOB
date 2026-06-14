import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword, signToken, setAuthCookie } from '@/lib/auth';
import { success, error, serverError } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return error('Email and password are required');
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return error('Invalid email or password', 401);
    }

    if (!user.isActive) {
      return error('Account is disabled. Contact admin.', 403);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return error('Invalid email or password', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    await setAuthCookie(token);

    return success({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (e) {
    console.error('Login error:', e);
    return serverError();
  }
}
