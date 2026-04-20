/**
 * Liv Brandt — observability for daglige auto-publishes.
 *
 * Returnerer de seneste N dages kørsler (default 7) — bruges af et UI eller
 * et debug-panel til at se hvilke artikler Liv har skrevet, hvilke der blev
 * skippet og hvorfor.
 *
 * Kræver Firebase ID-token (samme auth som nyhedsbrevs-status), så historikken
 * ikke lækker offentligt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { listRecentLivDaily } from '@/lib/liv/daily-history-store';

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const limitRaw = Number.parseInt(sp.get('limit') || '7', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 60) : 7;

  try {
    const entries = await listRecentLivDaily(limit);
    const counts = entries.reduce(
      (acc, e) => {
        acc[e.status] = (acc[e.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      ok: true,
      limit,
      counts,
      entries,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}
