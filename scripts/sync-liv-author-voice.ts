/** Explicit, one-time canonical voice mirror. No model calls or article writes.
 * Requires existing WEBFLOW_API_TOKEN / WEBFLOW_AUTHORS_COLLECTION_ID in process env.
 * Inspect first; apply only with the observed raw CMS hash. Never prints credentials.
 */
import { createHash } from 'node:crypto';
import { loadLivVoice } from '../lib/liv/voice';
import { load } from 'cheerio';

const LIV_ID = '67dbf17ba540975b5b21c31c';
const LOCALE = '67dbf17ba540975b5b21c225';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const normalize = (s: string) => s.replace(/\s+/gu, ' ').trim();
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function syncLivAuthorVoice(expectedHash?: string) {
  const token = process.env.WEBFLOW_API_TOKEN;
  const collection = process.env.WEBFLOW_AUTHORS_COLLECTION_ID;
  if (!token || !collection || !/^[a-f0-9]{24}$/.test(collection)) throw Error('voice_sync_config_missing');
  const url = `https://api.webflow.com/v2/collections/${collection}/items/${LIV_ID}?cmsLocaleId=${LOCALE}`;
  const request = async (method = 'GET', body?: unknown) => {
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw Error(`voice_sync_http_${r.status}`);
    return r.json();
  };
  const before = await request();
  if (before.id !== LIV_ID || before.cmsLocaleId !== LOCALE || before.isArchived || before.fieldData?.slug !== 'liv-brandt') throw Error('voice_sync_identity_mismatch');
  const old = before.fieldData['author-prompt'];
  if (typeof old !== 'string' || !old.trim()) throw Error('voice_sync_source_missing');
  const voice = loadLivVoice();
  const html = voice.text.split(/\n\n/).map(p => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  const same = (raw: string) => {
    const $ = load(raw); $('br').replaceWith(' '); $('p').append(' ');
    return normalize($.root().text()) === normalize(voice.text);
  };
  if (!expectedHash) return { action: 'inspect', authorId: LIV_ID, field: 'author-prompt', sourceHash: sha(old), canonicalHash: voice.hash, matches: same(old) };
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || sha(old) !== expectedHash) throw Error('voice_sync_source_changed');
  if (!same(old)) await request('PATCH', { cmsLocaleId: LOCALE, fieldData: { 'author-prompt': html } });
  const after = await request();
  if (after.id !== LIV_ID || after.cmsLocaleId !== LOCALE || after.isArchived || after.fieldData?.slug !== 'liv-brandt') throw Error('voice_sync_identity_mismatch');
  if (!same(after.fieldData?.['author-prompt'] || '')) throw Error('voice_sync_readback_mismatch');
  // Only author-prompt may change; metadata timestamps are owned by Webflow.
  for (const key of new Set([...Object.keys(before.fieldData), ...Object.keys(after.fieldData)])) {
    if (key !== 'author-prompt' && JSON.stringify(before.fieldData[key]) !== JSON.stringify(after.fieldData[key])) throw Error('voice_sync_other_field_changed');
  }
  return { action: 'synchronized', authorId: LIV_ID, field: 'author-prompt', previousHash: sha(old), canonicalHash: voice.hash, cmsHash: sha(after.fieldData['author-prompt']), readbackMatches: true, otherFieldsPreserved: true };
}
