import { load } from 'cheerio';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { addDays, eligibleEntries, type DeliveryState, type ReadyEntry } from './delivery-policy';
import type { ApprovalStory } from './approval-types';
import { isLivArticleFormat, parseResearchRating, type LivArticleFormat } from './review-format';
import { LIV_SUBJECT_LABELS, LIV_SUBJECT_TYPES } from './article-output';

export const APPROVAL_PAGE_SIZE = 1;
export function approvalEntries(state: DeliveryState, day: string) {
  const tomorrow = addDays(day, 1);
  // An unresolved slot is authoritative, including reserves. Never preview a
  // different ready story while its delivery is selected or uncertain.
  const held = Object.entries(state.slots).filter(([date, slot]) => slot.state === 'attempted' ||
    (slot.state === 'selected' && [day, tomorrow].includes(date)))
    .sort(([a, x], [b, y]) => Number(y.state === 'attempted') - Number(x.state === 'attempted') || a.localeCompare(b))[0];
  if (held) return state.entries.filter(entry => entry.itemId === held[1].itemId && entry.state === 'selected').slice(0, 1);
  if (state.coverRevision) return [];
  // Presentation only: retain legacy reserves, future stock and decisions in storage.
  // Keep a rejected choice visible until a replacement exists so it can be reversed.
  const decisionOrder = (entry: ReadyEntry) => entry.decision === 'approved' ? 0 : entry.decision === 'rejected' ? 2 : 1;
  const scheduled = state.entries.filter(entry => entry.kind === 'scheduled' && ['ready', 'selected'].includes(entry.state) &&
    entry.expiresDay >= day && [day, tomorrow].includes(entry.scheduledDay) &&
    (!state.slots[entry.scheduledDay] || (state.slots[entry.scheduledDay].state !== 'published' &&
      state.slots[entry.scheduledDay].itemId === entry.itemId)))
    .sort((a, b) => a.scheduledDay.localeCompare(b.scheduledDay) ||
      Number(b.state === 'selected') - Number(a.state === 'selected') || decisionOrder(a) - decisionOrder(b) ||
      a.preparedAt.localeCompare(b.preparedAt) || a.itemId.localeCompare(b.itemId));
  const nextDay = state.slots[day]?.state === 'published' ? tomorrow : day;
  const readyScheduled = scheduled.find(entry => entry.scheduledDay === nextDay && entry.decision !== 'rejected');
  if (readyScheduled) return [readyScheduled];
  if (state.slots[nextDay]) return scheduled.slice(0, 1);
  const reserve = eligibleEntries(state, nextDay).find(entry => entry.kind === 'reserve' &&
    !Object.values(state.slots).some(slot => slot.itemId === entry.itemId));
  const futureScheduled = scheduled.find(entry => entry.decision !== 'rejected');
  return reserve ? [reserve] : futureScheduled ? [futureScheduled] : scheduled.slice(0, 1);
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
export function approvalStory(entry: ReadyEntry, payload: WebflowArticleFields & {
  articleFormat?: LivArticleFormat; ratingReason?: string;
}, viewerUserId?: string): ApprovalStory {
  const $ = load(payload.content || '');
  $('script, style, iframe, noscript, figure').remove();
  const paragraphs = $('p, h2, h3').toArray().map(node => plain($(node).html() || '')).filter(Boolean);
  const intro = plain(payload.intro || '');
  const body = paragraphs.length ? paragraphs : [plain(payload.content)];
  const savedCategory = plain(payload.category || '').slice(0, 100);
  const subjectType = payload.subjectType && LIV_SUBJECT_TYPES.includes(payload.subjectType) ? payload.subjectType : null;
  const category = subjectType ? LIV_SUBJECT_LABELS[subjectType]
    : /^tv-serier?$/i.test(savedCategory) ? 'TV-serie' : savedCategory || 'Kultur';
  const articleFormat = isLivArticleFormat(payload.articleFormat) ? payload.articleFormat : null;
  let rating: number | null = null, ratingReason: string | null = null;
  if (articleFormat === 'research-review' && Number.isInteger(payload.rating)) {
    const reason = typeof payload.ratingReason === 'string' ? plain(payload.ratingReason) : '';
    try {
      const validated = parseResearchRating(`Rating: ${payload.rating}\nRatingReason: ${reason}`, articleFormat);
      if (validated) { rating = validated.value; ratingReason = validated.reason; }
    } catch { /* Missing or invalid rationale is never replaced with invented stars. */ }
  }
  return { itemId: entry.itemId, payloadHash: entry.payloadHash, revision: entry.decisionRevision || 0,
    title: plain(entry.title), summary: plain(payload.excerpt || payload.subtitle || payload.intro || paragraphs[0] || '').slice(0, 360),
    paragraphs: intro && body[0] !== intro ? [intro, ...body] : body,
    category, articleFormat, formatLabel: articleFormat === 'research-review' ? 'Researchanmeldelse' : 'Artikel', rating, ratingReason,
    feedback: viewerUserId && entry.editorialFeedback?.userId === viewerUserId ? entry.editorialFeedback.text : null,
    image: publicImage(payload.featuredImage), imageAlt: plain(payload.featuredImageAlt || entry.title),
    credit: plain(payload.fotoCredit || ''), scheduledDay: entry.scheduledDay, kind: entry.kind, state: entry.state,
    decision: entry.decision || 'pending' };
}
