import type { NextRequest } from 'next/server';

/**
 * Explicit secret checks — do NOT rely on middleware alone (it also accepts Firebase tokens).
 */
export function requireInternalApiSecret(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_SECRET?.trim();
  if (!expected) {
    // Local/dev without secret: allow only outside production
    return process.env.NODE_ENV !== 'production';
  }
  const header = req.headers.get('x-internal-api-secret')?.trim();
  return Boolean(header && header === expected);
}

/**
 * Cron auth: always require Authorization: Bearer CRON_SECRET in production.
 * Never trust x-vercel-cron alone (spoofable).
 */
export function requireCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers.get('authorization')?.trim();
  return auth === `Bearer ${expected}`;
}
