import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { discoverSignals, runEditorialResearch } from '@/lib/editorial/engine';
import { generateLivArticle } from '@/lib/liv/generate-article';
import type { DeskStory } from '@/lib/editorial/desk-types';
import { fetchEditorialAudience } from '@/lib/editorial/audience-research';
import { canonicalSourceUrl } from '@/lib/editorial/audience-signals';
import { checkCmsDraft } from '@/lib/editorial/cms-preflight';

export const maxDuration = 300;

async function context(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  const db = getAdminDb();
  return { uid, db };
}

export async function GET(req: NextRequest) {
  const { uid, db } = await context(req);
  if (!uid) return NextResponse.json({ error: 'Log ind for at åbne redaktionen.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'Redaktionens database er ikke tilgængelig.' }, { status: 503 });
  try {
    const desk = db.collection('editorialDesks').doc(uid);
    const [snapshot, settings] = await Promise.all([desk.collection('stories').orderBy('updatedAt', 'desc').limit(100).get(), desk.get()]);
    return NextResponse.json({ stories: snapshot.docs.map(d => ({ ...d.data(), id: d.id })), audience: settings.data()?.audience || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Historierne kunne ikke hentes. Prøv igen.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const { uid, db } = await context(req);
  if (!uid) return NextResponse.json({ error: 'Log ind for at arbejde i redaktionen.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'Redaktionens database er ikke tilgængelig.' }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!body || !['discover', 'research', 'draft', 'preflight'].includes(body.action)) return NextResponse.json({ error: 'Ugyldig handling.' }, { status: 400 });
  const desk = db.collection('editorialDesks').doc(uid);
  const stories = desk.collection('stories');
  try {
    if (body.action === 'discover') {
      const lease = Date.now();
      await db.runTransaction(async tx => {
        const state = (await tx.get(desk)).data();
        if (state?.discoverUntil > lease) throw new Error('Discovery already running');
        tx.set(desk, { discoverUntil: lease + 330000, discoverLease: lease }, { merge: true });
      });
      try {
      const [audience, history] = await Promise.all([
        fetchEditorialAudience(),
        stories.orderBy('updatedAt', 'desc').limit(1000).get(),
      ]);
      await desk.set({ audience }, { merge: true });
      const previous = history.docs.map(doc => doc.data() as DeskStory);
      const signals = await discoverSignals({ limit: 10, audienceSignals: audience.signals,
        recentBeats: previous.filter(row => Date.parse(row.createdAt || row.updatedAt) >= Date.now() - 14 * 86400000).map(row => row.signal.beat),
      });
      let created = 0;
      const hash = (value: string) => createHash('sha256').update(value).digest('hex');
      for (const signal of signals) {
        const id = createHash('sha256').update(signal.id).digest('hex');
        const ref = stories.doc(id);
        const sourceUrl = canonicalSourceUrl(signal.sources?.[0]?.url);
        const titleKey = signal.title.toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        if (previous.some(row => row.signal.id === signal.id || row.signal.title.toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === titleKey || (sourceUrl && canonicalSourceUrl(row.signal.sources?.[0]?.url) === sourceUrl))) continue;
        const keys = [desk.collection('storyKeys').doc(hash(`title:${titleKey}`)), ...(sourceUrl ? [desk.collection('storyKeys').doc(hash(`url:${sourceUrl}`))] : [])];
        const inserted = await db.runTransaction(async tx => {
          const snapshots = await Promise.all([tx.get(ref), ...keys.map(key => tx.get(key))]);
          if (snapshots.some(snapshot => snapshot.exists)) return false;
          tx.create(ref, JSON.parse(JSON.stringify({ id, signal, status: 'discovered', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })));
          for (const key of keys) tx.create(key, { storyId: id });
          return true;
        });
        if (inserted) created++;
      }
      return NextResponse.json({ ok: true, found: created, skippedDuplicates: signals.length - created });
      } finally {
        await db.runTransaction(async tx => {
          if ((await tx.get(desk)).data()?.discoverLease === lease) tx.set(desk, { discoverUntil: Date.now() + 60000 }, { merge: true });
        });
      }
    }
    if (typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id)) return NextResponse.json({ error: 'Ugyldig historie.' }, { status: 400 });
    const ref = stories.doc(body.id);
    if (body.action === 'preflight') {
      await db.runTransaction(async tx => {
        const row = (await tx.get(ref)).data() as DeskStory | undefined;
        if (!row?.article || row.status !== 'draft') throw new Error('No saved draft');
        tx.update(ref, { cmsPreflight: checkCmsDraft(row.article, row.research?.brief.targetWordCount), updatedAt: new Date().toISOString() });
      });
      return NextResponse.json({ ok: true });
    }
    const claimedAt = new Date().toISOString();
    const story = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new Error('Historien findes ikke.');
      const row = snapshot.data() as DeskStory;
      if (row.status === 'draft') throw new Error('Udkastet er allerede gemt. Åbn det i Writer.');
      if (['researching', 'drafting'].includes(row.status) && Date.now() - Date.parse(row.updatedAt) < 360000) throw new Error('Historien bliver allerede behandlet.');
      if (body.action === 'draft' && !row.research?.qualityGate.ready) throw new Error('Historien kræver research før skrivning.');
      tx.update(ref, { status: body.action === 'research' ? 'researching' : 'drafting', updatedAt: claimedAt, error: null });
      return row;
    });
    try {
      const output = body.action === 'research'
        ? { research: await runEditorialResearch(story.signal), status: 'researched' }
        : { article: await generateLivArticle({
            topic: { title: story.signal.title, score: 0, category: story.signal.beat, source: {
              title: story.signal.title, url: story.signal.sources?.[0]?.url || undefined,
              excerpt: story.signal.sources?.[0]?.content, sourceName: story.signal.sources?.[0]?.source,
            } },
            expandedDirective: story.research?.brief.text,
            sourceScope: uid,
            directiveHint: (story.research?.dossier.sources || []).map(source => source.url).filter(Boolean).join('\n'),
            section: story.signal.beat,
            targetWordCount: story.research?.brief.targetWordCount,
            // Do not forward internal credentials to a caller-controlled Host.
            baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
          }), status: 'draft' };
      await db.runTransaction(async tx => {
        const latest = await tx.get(ref);
        if (latest.data()?.updatedAt !== claimedAt) throw new Error('En nyere behandling har overtaget historien.');
        tx.update(ref, JSON.parse(JSON.stringify({ ...output, updatedAt: new Date().toISOString() })));
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      await db.runTransaction(async tx => {
        if ((await tx.get(ref)).data()?.updatedAt === claimedAt) tx.update(ref, { status: 'failed', updatedAt: new Date().toISOString(), error: 'Behandlingen fejlede. Prøv igen.' });
      });
      throw error;
    }
  } catch {
    return NextResponse.json({ error: 'Handlingen kunne ikke gennemføres. Opdater historien og prøv igen.' }, { status: 409 });
  }
}
