import { getAdminDb } from '@/lib/firebase-admin';
import { createHash } from 'node:crypto';

export const SEO_PROCESSOR_VERSION = 'chatgpt-seo-v1';
export const seoStateId = (itemId: string, locale: string) => createHash('sha256').update(`${itemId}:${locale}`).digest('hex');
export function seoDb() { const db = getAdminDb(); if (!db) throw Error('seo_firestore_unavailable'); return db; }
export async function seoProcessorMode() {
  const row = (await seoDb().collection('seoPostPublishControl').doc('processor').get()).data();
  return row?.mode === 'chatgpt-first' ? 'chatgpt-first' : 'api';
}
/** Fail closed on storage failure; never change a billing hold or paid-stage receipt. */
export async function assertLegacySeoProcessor(itemId?: string, locale = 'da') {
  if (await seoProcessorMode() === 'chatgpt-first') throw Error('seo_chatgpt_processor_required');
  if (itemId) {
    const row = (await seoDb().collection('seoPostPublishArticles').doc(seoStateId(itemId, locale)).get()).data();
    if (row?.chatJobId) throw Error('seo_chatgpt_article_reserved');
  }
}
