import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, type JWTPayload } from './auth';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

export type RouteHandler = (
  req: AuthenticatedRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/sync/webhook',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    // Skip auth for public paths
    if (isPublicPath(req.nextUrl.pathname)) {
      return handler(req, context);
    }

    // Check for API key auth (desktop connector)
    const apiKey = req.headers.get('x-api-key');
    if (apiKey) {
      // API key auth handled in individual routes
      (req as AuthenticatedRequest).user = { userId: 'device', email: '', role: 'device' };
      return handler(req, context);
    }

    // JWT auth
    const token = req.cookies.get('tom_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    (req as AuthenticatedRequest).user = payload;
    return handler(req, context);
  };
}

export function requireRole(...roles: string[]) {
  return (handler: RouteHandler): RouteHandler => {
    return withAuth(async (req, context) => {
      const user = (req as AuthenticatedRequest).user;
      if (!user || !roles.includes(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return handler(req, context);
    });
  };
}

// Helper to extract and validate company access
export async function validateCompanyAccess(
  userId: string,
  companyId: string
): Promise<boolean> {
  const { db } = await import('./db');
  const companyUser = await db.companyUser.findUnique({
    where: {
      userId_companyId: { userId, companyId },
    },
  });
  return !!companyUser;
}
