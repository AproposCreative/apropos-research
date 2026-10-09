import { getAdminDb } from '@/lib/firebase-admin';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { compressArticleFieldData } from './article-image-auto-optimize';
import { resolveWebflowLocaleIds } from './locale-items';
import { readEditorialImage, imageByteHash } from '@/lib/images/text-free';
import { load } from 'cheerio';

const POLICY = 'published-compression-2026-10-09-v1';
type Fields = Record<string, unknown>;
type Item = { id: string; cmsLocaleId: string; fieldData: Fields; isDraft?: boolean; isArchived?: boolean; lastPublished?: string };
function imageUrl(value: unknown) { return typeof value === 'string' ? value : (value as {url?: string} | null)?.url; }
const imageUrls = (html: unknown) => {
  if (typeof html !== 'string') return [];
  const $ = load(html);
  return $('img').toArray().map(e => $(e).attr('src') || '');
};

/** Webflow can rehost an upload. Compare decoded destination bytes, not URL spelling. */
export async function verifyCompressedFields(expected: Fields, actual: Fields, changed: string[]) {
  const normalized = { ...actual };
  for (const key of changed) {
    if (['thumb', 'mobile-image'].includes(key)) {
      const a = imageUrl(expected[key]), b = imageUrl(actual[key]);
      if (!a || !b) throw Error('image_optimization_readback_mismatch');
      if (a !== b && imageByteHash(await readEditorialImage(a)) !== imageByteHash(await readEditorialImage(b))) throw Error('image_optimization_asset_mismatch');
      const alt = (v: unknown) => typeof v === 'object' && v ? (v as {alt?: string}).alt || '' : '';
      if (alt(expected[key]) !== alt(actual[key])) throw Error('image_optimization_alt_mismatch');
      normalized[key] = expected[key];
    }
    if (['content', 'post-body'].includes(key)) {
      // Rich-text fields must preserve the exact surrounding editorial HTML.
      const a = imageUrls(expected[key]), b = imageUrls(actual[key]);
      if (a.length !== b.length) throw Error('image_optimization_readback_mismatch');
      let html = String(actual[key]);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) {
        if (imageByteHash(await readEditorialImage(a[i])) !== imageByteHash(await readEditorialImage(b[i]))) throw Error('image_optimization_asset_mismatch');
        html = html.split(b[i]).join(a[i]);
      }
      normalized[key] = html;
    }
  }
  if (cmsFieldHash(normalized) !== cmsFieldHash(expected)) throw Error('image_optimization_readback_mismatch');
}

/** Only already-published, unchanged locales. No site publish, model calls,
 * automatic retries of uncertain writes, or promotion of someone else's draft. */
export async function optimizePublishedArticleImages(itemId: string, cmsLocaleId?: string | null) {
  const locales = resolveWebflowLocaleIds();
  const locale = !cmsLocaleId || cmsLocaleId === locales.dk ? 'da' : cmsLocaleId === locales.en ? 'en' : null;
  if (!locale) throw Error('image_optimization_unknown_locale');
  cmsLocaleId = locale === 'da' ? locales.dk : locales.en;
  if (!/^[a-f0-9]{24}$/.test(itemId) || !cmsLocaleId) throw Error('image_optimization_invalid_item');
  const config = getWebflowConfig(), token = config.apiToken ?? env.WEBFLOW_API_TOKEN;
  const collection = config.articlesCollectionId ?? env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const db = getAdminDb();
  if (!token || !collection || !db) throw Error('image_optimization_not_configured');
  const base = `https://api.webflow.com/v2/collections/${collection}/items`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function read(live: boolean): Promise<Item | null> {
    const r = await fetch(`${base}/${itemId}${live ? '/live' : ''}?cmsLocaleId=${cmsLocaleId}`, { headers, cache:'no-store', signal:AbortSignal.timeout(20_000) });
    if (live && r.status === 404) return null;
    if (!r.ok) throw Error(`image_optimization_read_${r.status}`);
    const raw = await r.json();
    const item = (raw.items || [raw]).find((i: Item) => i.cmsLocaleId === cmsLocaleId);
    if (!item || item.id !== itemId || !item.fieldData) throw Error('image_optimization_locale_mismatch');
    return item;
  }
  const lease = await acquireCmsWriteLease(itemId, locale);
  try {
    const [live, staged] = await Promise.all([read(true), read(false)]);
    if (!live || live.isDraft || live.isArchived || !live.lastPublished) return { itemId, skipped:true, reason:'not_published' };
    const before = live.fieldData, beforeHash = cmsFieldHash(before);
    if (!staged || staged.isDraft || staged.isArchived || cmsFieldHash(staged.fieldData) !== beforeHash) return { itemId, skipped:true, reason:'unpublished_changes' };
    const ref = db.collection('webflowArticleImageAutoOptimize').doc(cmsFieldHash({ policy:POLICY, itemId, cmsLocaleId, beforeHash }));
    const prior = (await ref.get()).data();
    if (prior?.status === 'write_started') throw Error('image_optimization_write_unconfirmed');
    if (prior?.status === 'complete' || prior?.status === 'no_changes') return { itemId, skipped:true, reason:'already_processed' };
    const fields = structuredClone(before);
    // Reuse stored derivatives after interruption before the actual CMS write.
    const result = prior?.patch ? prior.result : await compressArticleFieldData({fieldData:fields, articleTitle:String(before.name || ''), articleSlug:String(before.slug || '')});
    if (result.contentImagesFailed) throw Error('image_optimization_incomplete');
    const patch: Fields = prior?.patch ?? Object.fromEntries(Object.entries(fields).filter(([key,value]) => cmsFieldHash({value}) !== cmsFieldHash({value:before[key]})));
    const changed = Object.keys(patch);
    if (changed.some(k => !['thumb','mobile-image','content','post-body'].includes(k))) throw Error('image_optimization_unsafe_patch');
    if (!changed.length) {
      await ref.set({itemId,cmsLocaleId,policy:POLICY,status:'no_changes',beforeHash,result,checkedAt:new Date().toISOString()});
      return {itemId,skipped:true,reason:'already_compliant_or_locked',...result};
    }
    await ref.set({itemId,cmsLocaleId,policy:POLICY,status:'prepared',beforeHash,before,patch,result,preparedAt:new Date().toISOString()});
    const [freshLive,freshStaged] = await Promise.all([read(true),read(false)]);
    if (!freshLive || !freshStaged || freshStaged.isDraft || freshStaged.isArchived ||
      cmsFieldHash(freshLive.fieldData)!==beforeHash || cmsFieldHash(freshStaged.fieldData)!==beforeHash) throw Error('image_optimization_cms_conflict');
    await lease.assertOwned();
    await ref.update({status:'write_started',writeStartedAt:new Date().toISOString()});
    // Patch only image-bearing fields on this live locale. Never publish all staged fields.
    let writeError: unknown;
    try {
      const response = await fetch(`${base}/live`, {method:'PATCH',headers,body:JSON.stringify({items:[{id:itemId,cmsLocaleId,fieldData:patch}]}),signal:AbortSignal.timeout(20_000)});
      if (!response.ok) throw Error(`image_optimization_write_${response.status}`);
    } catch(error) { writeError = error; }
    const after = await read(true);
    if (!after) throw Error('image_optimization_readback_missing');
    try { await verifyCompressedFields({...before,...patch},after.fieldData,changed); }
    catch(error) { throw writeError || error; }
    await ref.update({status:'complete',afterHash:cmsFieldHash(after.fieldData),completedAt:new Date().toISOString()});
    return {itemId,cmsLocaleId,patched:true,cmsVerified:true,...result};
  } finally { await lease.release(); }
}
