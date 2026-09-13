import { createHash } from 'node:crypto';
import { z } from 'zod';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';
import { sourceUrl } from '@/lib/factcheck/source-reader';

export const runtime = 'nodejs';
const input = z.object({ operationId: z.string().uuid(), url: z.string().max(2048),
  angle: z.string().trim().min(10).max(1500) }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

/** Explicitly shared tips only. No private drafts, remote fetching or AI calls. */
export async function GET(request: Request) {
  if (!await editorialRequestAccess(request)) return reply({ error: 'Log ind.' }, 401);
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const rows = await db.collection('editorialTips').orderBy('createdAt', 'desc').limit(50).get();
    return reply({ tips: rows.docs.map(doc => {
      const tip = doc.data();
      return { id: doc.id, url: tip.url, angle: tip.angle, createdAt: tip.createdAt, status: tip.status };
    }) });
  } catch { return reply({ error: 'Tip kunne ikke hentes.' }, 503); }
}

export async function POST(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return reply({ error: 'Log ind.' }, 401);
  let data: z.infer<typeof input>;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 6000) return reply({ error: 'Dit tip er for langt.' }, 413);
    data = input.parse(JSON.parse(raw)); data.url = sourceUrl(data.url).href;
  } catch { return reply({ error: 'Angiv et HTTPS-link og en vinkel på 10–1500 tegn.' }, 400); }
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const id = createHash('sha256').update(`${access.uid}:${data.operationId}`).digest('hex');
    const ref = db.collection('editorialTips').doc(id);
    const digest = createHash('sha256').update(JSON.stringify({ url: data.url, angle: data.angle })).digest('hex');
    const result = await db.runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists) return existing.data()?.digest === digest ? 'existing' : 'conflict';
      tx.create(ref, { url: data.url, angle: data.angle, digest, submittedBy: access.uid,
        createdAt: new Date().toISOString(), status: 'proposed' });
      return 'created';
    });
    return result === 'conflict' ? reply({ error: 'Dette forsøg tilhører et andet tip.' }, 409)
      : reply({ id, status: 'proposed', created: result === 'created' }, result === 'created' ? 201 : 200);
  } catch { return reply({ error: 'Kvitteringen kunne ikke hentes. Prøv samme tip igen.' }, 503); }
}
