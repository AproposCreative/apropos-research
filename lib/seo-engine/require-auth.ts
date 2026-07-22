import type { NextRequest } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import {
  assertCanAccessOwnedDoc,
  isSeoEngineAdmin,
  isSeoEngineUidAllowed,
} from '@/lib/seo-engine/access';
import { jsonError } from '@/lib/seo-engine/http';

export async function requireSeoEngineUser(req: NextRequest): Promise<
  | { ok: true; userId: string; isAdmin: boolean; response?: undefined }
  | { ok: false; userId?: undefined; isAdmin?: undefined; response: ReturnType<typeof jsonError> }
> {
  const userId = await getNewsletterUserIdFromRequest(req);
  if (!userId) {
    return { ok: false, response: jsonError(401, 'unauthorized', 'Login påkrævet') };
  }
  if (!isSeoEngineUidAllowed(userId)) {
    return { ok: false, response: jsonError(403, 'forbidden', 'UID ikke tilladt for SEO Engine') };
  }
  return { ok: true, userId, isAdmin: isSeoEngineAdmin(userId) };
}

export function assertOwnershipOrAdmin(args: {
  userId: string;
  createdBy?: string | null;
}): void {
  assertCanAccessOwnedDoc({
    userId: args.userId,
    createdBy: args.createdBy,
  });
}

export function requireSeoEngineAdmin(userId: string): void {
  if (!isSeoEngineAdmin(userId)) {
    throw Object.assign(new Error('Kun admin kan ændre global auto-SEO'), {
      code: 'forbidden',
    });
  }
}
