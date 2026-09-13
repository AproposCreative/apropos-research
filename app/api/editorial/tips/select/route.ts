import { createHash } from 'node:crypto';
import { z } from 'zod';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';
import { canonicalSourceUrl } from '@/lib/editorial/audience-signals';
import { sourceUrl } from '@/lib/factcheck/source-reader';
import type { DeskStory } from '@/lib/editorial/desk-types';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const input = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Select an explicit shared tip. Research is a separate existing desk operation. */
export async function POST(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return reply({ error: 'Log ind.' }, 401);
  if (!access.owner) return reply({ error: 'Kun Frederik kan vælge tip til redaktionen.' }, 403);
  let id: string;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 300) return reply({ error: 'Ugyldigt tip.' }, 400);
    id = input.parse(JSON.parse(raw)).id;
  } catch { return reply({ error: 'Ugyldigt tip.' }, 400); }
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const tipRef = db.collection('editorialTips').doc(id);
    const desk = db.collection('editorialDesks').doc(access.uid);
    const result = await db.runTransaction(async tx => {
      const tip = (await tx.get(tipRef)).data();
      if (!tip) return { error: 'missing' };
      const url = sourceUrl(tip.url).href;
      const key = desk.collection('storyKeys').doc(hash(`url:${canonicalSourceUrl(url)}`));
      const previousKey = (await tx.get(key)).data();
      const storyId = tip.storyId || previousKey?.storyId || hash(`tip:${id}`);
      if (typeof storyId !== 'string' || !/^[a-f0-9]{64}$/.test(storyId)) throw new Error('invalid_story');
      const storyRef = desk.collection('stories').doc(storyId);
      const existing = await tx.get(storyRef);
      if ((tip.storyId || previousKey) && !existing.exists) throw new Error('missing_saved_story');
      const now = new Date().toISOString();
      if (!existing.exists) {
        const story: DeskStory = { id: storyId, status: 'discovered', createdAt: now, updatedAt: now,
          signal: { id: `tip:${id}`, title: String(tip.angle).slice(0, 160), source: 'Redaktionens tip',
            beat: 'kultur', urgency: 0, originality: 0, brandFit: 0, risk: 0,
            audience: 'Apropos-læsere', angle: tip.angle, evidence: [],
            nextAction: 'Research link og vinkel. Emne, aktualitet og vurderinger er endnu ikke verificeret.',
            sources: [{ title: 'Link fra redaktionen', content: '', source: new URL(url).hostname, url }] } };
        tx.create(storyRef, story);
      }
      if (!previousKey) tx.create(key, { storyId });
      if (tip.status !== 'selected' || tip.storyId !== storyId) tx.update(tipRef, {
        status: 'selected', storyId, selectedBy: access.uid, selectedAt: now,
      });
      return { storyId, created: !existing.exists };
    });
    if ('error' in result) return reply({ error: 'Tipset findes ikke.' }, 404);
    return reply(result);
  } catch { return reply({ error: 'Tipset kunne ikke vælges. Gemte historier er bevaret; prøv samme tip igen.' }, 503); }
}
