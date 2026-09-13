import { createHash } from 'node:crypto';
import { z } from 'zod';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkMediaSource } from '@/lib/media-source-check-cache';
import { mediaSourceUrl } from '@/lib/media-source-validation';

export const runtime = 'nodejs';
export const maxDuration = 30;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const input = z.object({
  name: z.string().trim().min(1).max(120), baseUrl: z.string().max(2048),
  sitemapIndex: z.string().max(2048), enabled: z.boolean(),
  revision: z.number().int().nonnegative(), refresh: z.boolean().optional(),
}).strict();

/** Reading settings never seeds sources, performs research or checks remote URLs. */
export async function GET(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return reply({ error: 'Log ind.' }, 401);
  if (!access.owner) return reply({ error: 'Kun Frederik kan administrere fælles kilder.' }, 403);
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const snapshot = await db.collection('sharedMediaSources').limit(100).get();
    const sources = snapshot.docs.map(doc => {
      const d = doc.data();
      return { id: doc.id, name: d.name, baseUrl: d.baseUrl, sitemapIndex: d.sitemapIndex,
        enabled: d.enabled === true, revision: d.revision ?? 0, check: d.check ?? null };
    });
    return reply({ sources });
  } catch { return reply({ error: 'Fælles kilder kunne ikke hentes.' }, 503); }
}

/** Stable URL identity + optimistic revision prevent overwriting another edit. */
export async function PUT(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return reply({ error: 'Log ind.' }, 401);
  if (!access.owner) return reply({ error: 'Kun Frederik kan administrere fælles kilder.' }, 403);
  let data: z.infer<typeof input>;
  let url: string;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 6000) return reply({ error: 'For stor forespørgsel.' }, 413);
    data = input.parse(JSON.parse(raw));
    url = mediaSourceUrl(data.baseUrl, data.sitemapIndex).href;
  } catch { return reply({ error: 'Kontrollér navn og HTTPS-kildeadresse.' }, 400); }
  const db = getAdminDb();
  if (!db) return reply({ error: 'Kilder kunne ikke gemmes.' }, 503);
  const id = createHash('sha256').update(url).digest('hex');
  const ref = db.collection('sharedMediaSources').doc(id);
  try {
    const previous = await ref.get();
    if ((previous.data()?.revision ?? 0) !== data.revision) return reply({ error: 'Kilden er ændret. Hent listen igen.' }, 409);
    // A disabled source can always be disabled even when its remote server is down.
    let check = previous.data()?.check ?? null;
    if (data.enabled || data.refresh) {
      try { check = await checkMediaSource(access.uid, data.baseUrl, data.sitemapIndex, data.refresh); }
      catch { return reply({ error: 'Kilden kunne ikke kontrolleres. Intet er ændret.' }, 422); }
    }
    const source = { id, name: data.name, baseUrl: new URL(data.baseUrl).origin,
      sitemapIndex: url, enabled: data.enabled, revision: data.revision + 1,
      check, updatedAt: new Date().toISOString(), updatedBy: access.uid };
    const saved = await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if ((current.data()?.revision ?? 0) !== data.revision) return false;
      tx.set(ref, source);
      return true;
    });
    return saved ? reply({ source }) : reply({ error: 'Kilden er ændret. Hent listen igen.' }, 409);
  } catch { return reply({ error: 'Kilden kunne ikke gemmes. Hent listen før du prøver igen.' }, 503); }
}
