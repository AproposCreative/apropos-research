import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { listMetadataHistory, setMetadataLocks } from '@/lib/seo-engine/post-publish/editorial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const LockRequest = z.object({ itemId: z.string().regex(/^[a-f0-9]{24}$/i), locale: z.enum(['da', 'en']),
  lockedFields: z.array(z.enum(['seoTitle', 'metaDescription'])).max(2).refine(fields => new Set(fields).size === fields.length) }).strict();

export async function GET(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
  if (cursor && !/^[a-f0-9]{64}$/.test(cursor)) return NextResponse.json({ error: 'Ugyldig side' }, { status: 400 });
  try { return NextResponse.json(await listMetadataHistory(cursor)); }
  catch { return NextResponse.json({ error: 'SEO-historikken kunne ikke hentes.' }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  const body = LockRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Ugyldige feltlåse' }, { status: 400 });
  try { return NextResponse.json(await setMetadataLocks(body.data.itemId, body.data.locale, body.data.lockedFields, auth.userId)); }
  catch (error) {
    const busy = (error as { code?: string })?.code === 'write_busy';
    return NextResponse.json({ error: busy ? 'Artiklens SEO opdateres. Prøv igen om lidt.' : 'Feltlåsene kunne ikke gemmes.' }, { status: busy ? 409 : 503 });
  }
}
