import { load } from 'cheerio';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { addDays, type DeliveryState, type ReadyEntry } from './delivery-policy';
import type { ApprovalStory } from './approval-types';

export const APPROVAL_PAGE_SIZE = 5;
export function approvalEntries(state: DeliveryState, day: string) {
  return state.entries.filter(e => e.expiresDay >= day && e.scheduledDay <= addDays(day, 7) &&
    (e.kind === 'reserve' || e.scheduledDay >= day))
    .sort((a, b) => Number(a.kind === 'reserve') - Number(b.kind === 'reserve') ||
      a.scheduledDay.localeCompare(b.scheduledDay) || a.itemId.localeCompare(b.itemId));
}
function plain(html: string) {
  const $ = load(html || '');
  $('script, style, iframe, noscript').remove();
  return $.root().text().replace(/\s+/g, ' ').trim();
}
function publicImage(value?: string) {
  try {
    const url = new URL(value || '');
    // Only stored publication assets, never arbitrary provider/proxy URLs.
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['cdn.prod.website-files.com', 'uploads-ssl.webflow.com', 'firebasestorage.googleapis.com',
        'storage.googleapis.com'].includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export function approvalStory(entry: ReadyEntry, payload: WebflowArticleFields): ApprovalStory {
  const $ = load(payload.content || '');
  $('script, style, iframe, noscript, figure').remove();
  const paragraphs = $('p, h2, h3').toArray().map(node => plain($(node).html() || '')).filter(Boolean);
  const topic = [payload.category, ...(payload.tags || []), ...(payload.topicsSelected || [])].join(' ').toLowerCase();
  const category = /\btv\b|serie|streaming/.test(topic) ? 'TV-serie' : /film|biograf/.test(topic) ? 'Film' :
    /kunst|udstilling/.test(topic) ? 'Kunst' : /musik|koncert|album/.test(topic) ? 'Musik' : 'Kultur';
  return { itemId: entry.itemId, payloadHash: entry.payloadHash, revision: entry.decisionRevision || 0,
    title: plain(entry.title), summary: plain(payload.excerpt || payload.subtitle || payload.intro || paragraphs[0] || '').slice(0, 360),
    paragraphs: (paragraphs.length ? paragraphs : [plain(payload.content)]).slice(0, 12).map(p => p.slice(0, 3000)),
    category, image: publicImage(payload.featuredImage), imageAlt: plain(payload.featuredImageAlt || entry.title),
    credit: plain(payload.fotoCredit || ''), scheduledDay: entry.scheduledDay, kind: entry.kind, state: entry.state,
    decision: entry.decision || 'pending' };
}
