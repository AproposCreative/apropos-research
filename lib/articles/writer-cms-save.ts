import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { normalizeArticlePayload, type ArticlePayload } from './article-payload';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { publishArticleDraftToWebflow } from './publish';
import { inspectArticleSave } from './save-receipt';
import { stagedSaveCandidates } from './find-staged-save';

export class WriterCmsPending extends Error {
  constructor(readonly articleId?: string) { super('CMS-gemningen afventer kontrol. Genprøv samme kladde; der oprettes ikke en ny kopi.'); }
}
type Attempt = { hash: string; token: string; leaseUntil: number; phase: 'preparing' | 'attempted' | 'saved';
  input: ArticlePayload; expected?: ArticlePayload; beforeIds?: string[]; articleId?: string };

/** One durable operation per private draft. No repeated create after uncertainty. */
export async function saveWriterCmsDraft(db: Firestore, uid: string, draftId: string, raw: ArticlePayload) {
  const input = normalizeArticlePayload({ ...raw, status: 'draft', workflowState: 'webflow_draft' });
  // Timestamps and a returned CMS ID are not new editorial content.
  const { publishDate: _date, webflowId: _id, id: _localId, ...stable } = input;
  const hash = cmsFieldHash(stable);
  const ref = db.collection('writerWorkspaces').doc(uid).collection('cmsSaves').doc(draftId);
  const token = randomUUID();
  const state = await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data() as Attempt | undefined;
    if (old && old.phase !== 'saved') {
      if (old.leaseUntil > Date.now()) throw new WriterCmsPending(old.articleId);
      if (old.phase === 'attempted') return { old, recover: true };
      if (old.hash !== hash) throw new WriterCmsPending(old.articleId);
    }
    if (old?.phase === 'saved' && old.hash === hash) return { old, recover: true };
    const attempt: Attempt = { hash, token, leaseUntil: Date.now() + 120_000, phase: 'preparing', input,
      ...(old?.articleId || input.webflowId ? { articleId: old?.articleId || input.webflowId } : {}) };
    if (old) tx.set(ref.collection('history').doc(old.token), JSON.parse(JSON.stringify(old)));
    tx.set(ref, JSON.parse(JSON.stringify(attempt)));
    return { old: attempt, recover: false };
  });
  const attempt = state.old;
  const checkpoint = async (patch: Partial<Attempt>) => db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data() as Attempt | undefined;
    if (current?.token !== attempt.token) throw new WriterCmsPending(current?.articleId);
    tx.update(ref, JSON.parse(JSON.stringify(patch)));
  });
  if (state.recover) {
    if (!attempt.expected) throw new WriterCmsPending(attempt.articleId);
    let articleId = attempt.articleId;
    if (!articleId) {
      const found = (await stagedSaveCandidates(attempt.expected)).filter(id => !attempt.beforeIds?.includes(id));
      if (found.length !== 1) throw new WriterCmsPending();
      articleId = found[0];
    }
    const receipt = await inspectArticleSave({ articleId, expected: attempt.expected });
    await checkpoint({ phase: 'saved', articleId, leaseUntil: 0 });
    // Reconcile the old version first. Never silently discard newer requested text.
    if (attempt.hash !== hash) throw new WriterCmsPending(articleId);
    return { articleId, ...receipt, publicationVerified: false };
  }
  try {
    const result = await publishArticleDraftToWebflow({ ...input, webflowId: attempt.articleId || '' }, {
      onBeforeSave: async expected => {
        const canonical = expected as ArticlePayload;
        const beforeIds = attempt.articleId ? [] : await stagedSaveCandidates(canonical, undefined, true);
        await checkpoint({ phase: 'attempted', expected: canonical, beforeIds });
      },
      onSaved: async articleId => { await checkpoint({ articleId }); },
    });
    await checkpoint({ phase: 'saved', articleId: result.articleId, leaseUntil: 0 });
    return { articleId: result.articleId, ...result.receipt, publicationVerified: false };
  } catch {
    // Keep the attempted marker even when fetch never returned. A later request
    // may only read/reconcile it. No TTL or retry counter makes create safe again.
    await checkpoint({ leaseUntil: 0 }).catch(() => {});
    const current = (await ref.get()).data() as Attempt | undefined;
    throw new WriterCmsPending(current?.articleId);
  }
}
