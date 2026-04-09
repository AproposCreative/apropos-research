import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/lib/config/env';

/**
 * Vercel Cron sender `Authorization: Bearer <CRON_SECRET>` når variablen er sat på projektet.
 * Returnerer null hvis OK; ellers en JSON NextResponse (503 = secret mangler, 403 = forkert/manglende header).
 */
export function requireCronBearer(req: NextRequest): NextResponse | null {
  const authz = req.headers.get('authorization') || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'CRON_SECRET er ikke sat — cron-endpoints afvises. Tilføj CRON_SECRET under Vercel → Environment Variables (Production) og redeploy.',
      },
      { status: 503 }
    );
  }
  if (bearer !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
