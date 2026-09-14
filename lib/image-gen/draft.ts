import { getAdminDb } from '@/lib/firebase-admin';
import { imageGenHash, insertImageGenFigures } from './article';
import { readImageGenArticle, patchImageGenDraft } from './webflow';
import { readImageGenJob, finishImageGenJob, type ImageGenJob } from './jobs';
import { readImageGenAsset } from './runtime';
import { uploadImageGenCmsAsset } from './cms-asset';

export type ImageGenSelection = { jobId: string; target: 'cover' | 'body'; sectionId?: string;
  alt: string; caption: string; credit: string; replaceCover?: boolean };
export function validateImageGenSelections(value: unknown): ImageGenSelection[] {
  if (!Array.isArray(value) || !value.length || value.length > 7) throw new Error('image_gen_selection_invalid');
  let covers = 0, bodies = 0; const ids = new Set<string>();
  return value.map(p => {
    if (!p || !/^[a-f0-9]{64}$/.test(p.jobId) || ids.has(p.jobId) || !['cover', 'body'].includes(p.target) ||
        [p.alt, p.caption, p.credit].some(s => typeof s !== 'string' || !s.trim() || s.length > 500) ||
        (p.target === 'body' && (!/^[a-f0-9]{64}$/.test(p.sectionId) || ++bodies > 6)) || (p.target === 'cover' && ++covers > 1)) {
      throw new Error('image_gen_selection_invalid');
    }
    ids.add(p.jobId);
    return { jobId: p.jobId, target: p.target, ...(p.target === 'body' ? { sectionId: p.sectionId } : {}),
      alt: p.alt.trim(), caption: p.caption.trim(), credit: p.credit.trim(), replaceCover: p.replaceCover === true };
  });
}

export async function previewImageGenDraft(uid: string, articleId: string, articleVersion: string, input: unknown) {
  const selections = validateImageGenSelections(input);
  const snapshot = await readImageGenArticle(articleId);
  if (snapshot.article.version !== articleVersion) throw new Error('image_gen_article_changed');
  const sections = new Set<string>();
  for (const selection of selections) {
    const source = await readImageGenJob(uid, selection.jobId);
    if (source?.status !== 'succeeded' || !['generate', 'edit', 'press-import', 'recover'].includes(source.operation) || source.articleId !== articleId) {
      throw new Error('image_gen_asset_invalid');
    }
    const asset = (await readImageGenAsset(uid, selection.jobId)).asset;
    // Source credit is retained, even when the caption and alt text are edited.
    if (!selection.credit.includes(asset.credit)) throw new Error('image_gen_credit_changed');
    if (selection.target === 'cover' && snapshot.cover && !selection.replaceCover) throw new Error('image_gen_cover_confirmation_required');
    if (selection.target === 'body') {
      if (!snapshot.article.sections.some(s => s.id === selection.sectionId) || sections.has(selection.sectionId!)) throw new Error('image_gen_anchor_invalid');
      sections.add(selection.sectionId!);
    }
  }
  return { ...snapshot, selections, previewId: imageGenHash(JSON.stringify([uid, articleId, articleVersion, selections])),
    publication: 'staged-only' as const };
}

/** Shared article lock serializes this app's editors; Webflow has no documented
 * conditional-write token here. Re-read immediately before PATCH and reject
 * detected external edits. Never retry an ambiguous PATCH automatically.
 */
export async function saveImageGenDraft(job: ImageGenJob) {
  const db = getAdminDb(); if (!db) throw new Error('image_gen_store_unavailable');
  const lock = db.collection('imageGenArticleLocks').doc(job.articleId);
  const receipt = db.collection('imageGenWorkspaces').doc(job.uid).collection('jobs').doc(job.id).collection('stages').doc('cms');
  let locked = false, patchStarted = false;
  try {
    const p = job.parameters as { selections: unknown; previewId: string };
    const preview = await previewImageGenDraft(job.uid, job.articleId, job.articleVersion, p.selections);
    if (preview.previewId !== p.previewId) throw new Error('image_gen_preview_changed');
    await db.runTransaction(async tx => {
      if ((await tx.get(lock)).data()?.jobId) throw new Error('image_gen_article_busy');
      tx.set(lock, { uid: job.uid, jobId: job.id, createdAt: new Date().toISOString() });
    });
    locked = true;
    await receipt.create({ status: 'uploading', articleVersion: job.articleVersion, selections: preview.selections,
      originalContent: preview.article.content, originalCover: preview.cover, originalCoverCredit: preview.coverCredit });
    const assets = new Map<string, { id: string; url: string }>();
    for (const s of preview.selections) {
      const source = await readImageGenAsset(job.uid, s.jobId);
      const target = receipt.collection('assets').doc(s.jobId);
      const asset = await uploadImageGenCmsAsset(source.bytes, `apropos-${source.asset.hash}.webp`, async allocated => {
        await target.create({ ...allocated, status: 'allocated', sourceJobId: s.jobId });
      });
      await target.update({ status: 'verified' }); assets.set(s.jobId, asset);
    }
    const latest = await readImageGenArticle(job.articleId);
    if (latest.article.version !== job.articleVersion) throw new Error('image_gen_article_changed');
    const fields: Record<string, unknown> = {};
    const cover = preview.selections.find(s => s.target === 'cover');
    if (cover) {
      fields.thumb = { fileId: assets.get(cover.jobId)!.id, url: assets.get(cover.jobId)!.url, alt: cover.alt };
      fields['foto-credit'] = `${cover.caption} ${cover.credit}`;
    }
    const body = preview.selections.filter(s => s.target === 'body');
    if (body.length) fields.content = insertImageGenFigures(latest.article, job.articleVersion,
      body.map(s => ({ ...s, sectionId: s.sectionId!, url: assets.get(s.jobId)!.url })));
    await receipt.update({ status: 'patch-started', fieldData: fields });
    patchStarted = true;
    await patchImageGenDraft(job.articleId, fields);
    const readback = await readImageGenArticle(job.articleId);
    const thumb = readback.cover as { url?: string; alt?: string } | null;
    if ((fields.content !== undefined && readback.article.content !== fields.content) ||
        (cover && (thumb?.url !== assets.get(cover.jobId)!.url || thumb?.alt !== cover.alt || readback.coverCredit !== fields['foto-credit'])) ||
        readback.isDraft !== latest.isDraft || readback.lastPublished !== latest.lastPublished) throw new Error('image_gen_cms_readback_failed');
    await receipt.update({ status: 'verified-staged', articleVersion: readback.article.version });
    await finishImageGenJob(job.uid, job.id, { status: 'succeeded', result: {
      articleId: job.articleId, articleVersion: readback.article.version, changedFields: Object.keys(fields), publication: 'staged-only',
    } });
    await lock.set({ jobId: null, lastVerifiedJobId: job.id });
  } catch {
    await finishImageGenJob(job.uid, job.id, { status: patchStarted ? 'uncertain' : 'failed-before-provider',
      errorCode: patchStarted ? 'cms_readback_required' : 'draft_preparation_blocked' }).catch(() => undefined);
    if (locked && !patchStarted) await lock.set({ jobId: null, lastBlockedJobId: job.id });
  }
}
