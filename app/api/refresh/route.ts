import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { getAdminDb } from '@/lib/firebase-admin';
import { runIngestToFirestore } from '@/lib/trending/ingest-runner';
import { resolveTrendingSource } from '@/lib/trending/source-filter';
import { getDefaultMediaSources } from '@/lib/getMediaSources';

export const maxDuration = 300;

/** Same Firestore pipeline as scheduled ingestion, awaited rather than detached. */
export async function POST(request: NextRequest) {
  if (!await getNewsletterUserIdFromRequest(request)) return NextResponse.json({ error: 'Log ind for at opdatere kilder.' }, { status: 401 });
  if (!getAdminDb()) return NextResponse.json({ error: 'Artikelarkivet er ikke tilgængeligt.' }, { status: 503 });
  let body;
  try { const raw = await request.text(); body = raw.trim() ? JSON.parse(raw) : {}; } catch { return NextResponse.json({ error: 'Ugyldig JSON.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Ugyldig forespørgsel.' }, { status: 400 });
  const source = resolveTrendingSource(typeof body.source === 'string' ? body.source : '', typeof body.sourceName === 'string' ? body.sourceName : '');
  // User-added publishers need a supported discovery adapter, not silent success.
  if (source.id && !getDefaultMediaSources().some(s => s.id === source.id)) return NextResponse.json({ error: 'Dette medies indlæsning er endnu ikke understøttet. Gemte artikler kan stadig læses.' }, { status: 422 });
  const limit = Math.min(20, Math.max(1, Number(body.limit) || 20));
  const requestedHours = Number(body.sinceHours) || (Number(body.sinceMinutes) / 60) || 168;
  const sinceHrs = Math.min(720, Math.max(1 / 60, requestedHours));
  try {
    const metrics = await runIngestToFirestore({ source: source.id || undefined, limit: Math.floor(limit), sinceHrs });
    if (!metrics.added && !metrics.updated && !metrics.unchanged) return NextResponse.json({ error: 'Ingen læsbare artikler blev hentet. Mediets feed, adgang eller parser kræver kontrol.', metrics }, { status: 422 });
    return NextResponse.json({ ok: true, metrics }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Kilderne kunne ikke opdateres. Prøv igen.' }, { status: 503 });
  }
}
