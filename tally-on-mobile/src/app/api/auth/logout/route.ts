import { removeAuthCookie } from '@/lib/auth';
import { success, serverError } from '@/lib/api-response';

export async function POST() {
  try {
    await removeAuthCookie();
    return success({ message: 'Logged out' });
  } catch (e) {
    return serverError();
  }
}
