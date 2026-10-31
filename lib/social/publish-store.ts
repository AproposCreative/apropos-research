import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { SocialPublishInput, SocialPublishReceipt } from './publish-types';
import { DEFAULT_TITLE_SUBTITLE_GAP, titleSubtitleGap } from './card-layout';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function database() { const db = getAdminDb(); if (!db) throw Error('social_publish_storage_unavailable'); return db; }
const requestKey = (uid: string, requestId: string) => hash([uid, requestId]);
/** Same image/caption/article/account is one operation, independent of tab, device,
 * upload token or checkbox changes. Channels are immutable once approved. */
export function socialPublishIdentity(input: SocialPublishInput, account: string) {
  const c = input.card;
  // Safari and Chrome may encode different JPEG bytes for the same approved
  // design. Use semantic card identity for the lock; verify the bytes separately.
  const card: unknown[] = [c.title, c.excerpt ?? '', c.theme ?? 'light', c.imageUrl ?? null,
    c.titleSizePercent ?? 100, c.subtitleSizePercent ?? 100, c.category ?? '', c.categorySecondary ?? '',
    c.eyebrowLabels ?? [], c.storyBottomMetaLabels ?? [], c.rating ?? null, c.caption ?? ''];
  // Keep the historical/default identity: adding this control must not unlock
  // another post of an already-published design. Nondefault spacing is a new design.
  const gap = titleSubtitleGap(c.titleSubtitleGap);
  if (gap !== DEFAULT_TITLE_SUBTITLE_GAP) card.push(['titleSubtitleGap', gap]);
  return hash(['social-publish-v1', account, input.articleId, card, input.isStory,
    input.isStory ? '' : input.caption, input.articleUrl]);
}
export async function claimSocialPublish(uid: string, input: SocialPublishInput, account: string, options?: { browserStory: true }) {
  const db = database(), id = socialPublishIdentity(input, account);
  const ref = db.collection('socialPublishOperations').doc(id);
  const requestRef = db.collection('socialPublishRequests').doc(requestKey(uid, input.requestId));
  return db.runTransaction(async tx => {
    const [snap, prior] = await Promise.all([tx.get(ref), tx.get(requestRef)]);
    if (prior.exists && prior.data()?.operationId !== id) throw Error('social_publish_request_changed');
    if (snap.exists) {
      const receipt = snap.data() as SocialPublishReceipt;
      if (receipt.ownerUid !== uid) throw Error('social_publish_already_requested');
      if (receipt.channels.facebook !== input.channels.facebook) throw Error('social_publish_channels_changed');
      tx.set(requestRef, { ownerUid: uid, operationId: id });
      return { created: false, receipt };
    }
    const now = new Date().toISOString();
    const receipt: SocialPublishReceipt = { id, ownerUid: uid, articleId: input.articleId, requestId: input.requestId,
      createdAt: now, updatedAt: now, complete: false, phase: 'preparing', channels: input.channels,
      instagram: { status: 'pending' }, facebook: { status: input.channels.facebook ? 'pending' : 'skipped' },
      // Article-link controls belong only to Story export. Retain the comment
      // receipt field for historical records without scheduling a Facebook write.
      comment: { status: 'skipped' }, imageSha256: input.imageSha256,
      approved: { card: input.card, caption: input.caption, articleUrl: input.articleUrl, isStory: input.isStory } };
    if (options?.browserStory) {
      if (!input.isStory || input.channels.facebook) throw Error('social_story_only');
      receipt.delivery = 'business-suite'; receipt.phase = 'story_queued';
      receipt.storyLink = { status: 'pending', label: 'Læs anmeldelsen', articleUrl: input.articleUrl };
      tx.create(db.collection('socialStoryBrowserTasks').doc(id), { id, ownerUid: uid, createdAt: now,
        requestId: input.requestId, status: 'queued', dispatchCount: 0, imageSha256: input.imageSha256,
        objectPath: `instagram-publish/${uid}-${input.imageSha256}.jpg`,
        articleUrl: input.articleUrl, stickerLabel: 'Læs anmeldelsen' });
    }
    tx.create(ref, receipt);
    tx.set(requestRef, { ownerUid: uid, operationId: id });
    return { created: true, receipt };
  });
}
export async function saveSocialPublish(receipt: SocialPublishReceipt) {
  await database().collection('socialPublishOperations').doc(receipt.id).update({ ...receipt, updatedAt: new Date().toISOString() });
}
export async function readSocialPublish(uid: string, requestId: string): Promise<SocialPublishReceipt | null> {
  const db = database();
  const pointer = (await db.collection('socialPublishRequests').doc(requestKey(uid, requestId)).get()).data();
  if (!pointer || pointer.ownerUid !== uid) return null;
  const row = (await db.collection('socialPublishOperations').doc(pointer.operationId).get()).data();
  return row?.ownerUid === uid ? row as SocialPublishReceipt : null;
}
export async function readSocialPublishIdentity(uid: string, input: SocialPublishInput, account: string): Promise<SocialPublishReceipt | null> {
  const row = (await database().collection('socialPublishOperations').doc(socialPublishIdentity(input, account)).get()).data() as SocialPublishReceipt | undefined;
  if (!row) return null;
  if (row.ownerUid !== uid) throw Error('social_publish_already_requested');
  if (row.channels.facebook !== input.channels.facebook) throw Error('social_publish_channels_changed');
  return row;
}
export async function recentSocialPublishes(uid: string, articleId: string): Promise<SocialPublishReceipt[]> {
  const result = await database().collection('socialPublishOperations').where('ownerUid', '==', uid).where('articleId', '==', articleId).get();
  return result.docs.map(doc => doc.data() as SocialPublishReceipt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Readback may overlap the original request. Merge only independently verified
 * facts into the newest row, never save an old snapshot over later stages. */
export async function reconcileSocialPublish(uid: string, id: string, facts: {
  containerId?: string; published?: boolean;
  links: Array<{ channel: 'instagram' | 'facebook'; id: string; url: string }>;
}) {
  const db = database(), ref = db.collection('socialPublishOperations').doc(id);
  return db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data() as SocialPublishReceipt | undefined;
    if (!row || row.ownerUid !== uid) throw Error('social_publish_not_found');
    if (facts.published && facts.containerId === row.containerId && ['sending', 'uncertain'].includes(row.instagram.status)) {
      row.instagram = { ...row.instagram, status: 'published' };
      delete row.instagram.error;
    }
    for (const link of facts.links) {
      if (row[link.channel].status === 'published' && row[link.channel].id === link.id) row[link.channel].url = link.url;
    }
    tx.update(ref, row);
    return row;
  });
}
