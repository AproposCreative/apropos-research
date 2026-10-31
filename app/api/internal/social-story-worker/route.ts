import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { sessionCipher, storyStore } from '@/services/story-browser/store.mjs';
export const runtime = 'nodejs';
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('session') }).strict(),
  z.object({ action: z.literal('saveSession'), state: z.object({ cookies: z.array(z.record(z.string(), z.unknown())).max(300),
    origins: z.array(z.object({ origin: z.string().url(), localStorage: z.array(z.object({ name: z.string(), value: z.string() }).strict()).max(1000) }).strict()).max(20) }).strict() }).strict(),
  z.object({ action: z.literal('claim'), operationId: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal('beforePublish'), operationId: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal('finish'), operationId: z.string().regex(/^[a-f0-9]{64}$/), result: z.object({
    mediaId: z.string().regex(/^\d+$/).optional(), storyUrl: z.string().url().optional(), linkVerified: z.boolean().optional(), loginRequired: z.boolean().optional(), articleUrl: z.string().url().optional(),
  }).strict() }).strict(),
]);
export async function POST(request: Request) {
  const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
  const secret = process.env.SOCIAL_STORY_BROWSER_SECRET, value = request.headers.get('x-story-service-secret');
  if (!secret || secret.length < 32 || !value || Buffer.byteLength(secret) !== Buffer.byteLength(value) || !timingSafeEqual(Buffer.from(secret), Buffer.from(value))) return json({ error: 'unauthorized' }, 401);
  try {
    const raw = await request.text(); if (raw.length > 800_000) return json({ error: 'invalid_request' }, 400);
    const parsed = body.safeParse(JSON.parse(raw)); if (!parsed.success) return json({ error: 'invalid_request' }, 400);
    const input = parsed.data, db = getAdminDb(); if (!db) throw Error();
    const store = storyStore(db, sessionCipher(secret));
    if (input.action === 'status') return json(await store.status());
    if (input.action === 'session') return json({ state: await store.session() ?? null });
    if (input.action === 'saveSession') {
      const allowed = (url: string) => { const u = new URL(url); return u.protocol === 'https:' && ['facebook.com', 'instagram.com'].some(h => u.hostname === h || u.hostname.endsWith('.'+h)); };
      if (input.state.cookies.some(c => typeof c.domain !== 'string' || !allowed('https://'+c.domain.replace(/^\./, ''))) || input.state.origins.some(o => !allowed(o.origin))) return json({ error: 'invalid_session' }, 400);
      await store.saveSession(input.state); return json({ saved: true });
    }
    if (input.action === 'claim') return json(await store.claim(input.operationId));
    if (input.action === 'beforePublish') { await store.beforePublish(input.operationId); return json({ persisted: true }); }
    if (input.result.storyUrl && !/^https:\/\/www\.instagram\.com\/stories\/aproposmagazineofficial\/\d+\/$/.test(input.result.storyUrl)) return json({ error: 'invalid_receipt' }, 400);
    if (input.result.linkVerified && (!input.result.mediaId || !input.result.storyUrl)) return json({ error: 'invalid_receipt' }, 400);
    return json(await store.finish(input.operationId, input.result));
  } catch { return json({ error: 'story_state_unconfirmed' }, 503); }
}
