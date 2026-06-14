import { getAuthUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { success, unauthorized, serverError } from '@/lib/api-response';

export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return unauthorized();
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.userId },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true },
    });

    if (!user) {
      return unauthorized('User not found');
    }

    return success({ user });
  } catch (e) {
    console.error('Me error:', e);
    return serverError();
  }
}
