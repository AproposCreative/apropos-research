import { load } from 'cheerio';
import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import { validDay } from '@/lib/liv/delivery-policy';
import { sourceUrl } from '@/lib/factcheck/source-reader';
import { readPressMedia } from '@/lib/liv/public-media-reader';

const text = (value: unknown, max = 250): string | null => typeof value === 'string'
  ? value.replace(/[\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null : null;
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
const name = (value: unknown): string | null => text(value) || text(object(value)?.name);
export function publicEventUrl(value: string, base?: string): string {
  const url = sourceUrl(base ? new URL(value, base).href : value);
  if ([...url.searchParams.keys()].some(key => /token|secret|password|signature|credential|api.?key/i.test(key)))
    throw Error('mcp_accreditation_source_url_invalid');
  return url.href;
}
function link(value: unknown, base: string): string | null {
  try { return typeof value === 'string' ? publicEventUrl(value, base) : null; } catch { return null; }
}
function pageKey(value: string): string {
  const url = new URL(value); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return `${url.origin}${url.pathname.replace(/\/$/, '')}${url.search}`;
}
export type EventClaim = {
  name: string | null; artist: string | null; performers: string[]; venue: string | null;
  eventDate: string | null; startDate: string | null; promoter: string | null;
  eventStatus: string | null; url: string | null; matchesSourcePage: boolean;
  sourceUrl: string; evidenceType: 'publisher_json_ld';
};
/** Bounded, non-executing extraction. Publisher metadata is a claim, never an approval. */
export function parseAccreditationEventSource(html: string, finalUrl: string, now = new Date().toISOString()) {
  const $ = load(html), claims: EventClaim[] = [], nodes: Record<string, unknown>[] = [];
  const title = text($('meta[property="og:title"]').attr('content') || $('title').text());
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || nodes.length >= 200) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(v => visit(v, depth + 1)); return; }
    const node = object(value); if (!node) return;
    nodes.push(node);
    // Only document/event containers, not arbitrary unrelated product data.
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'subEvent']) visit(node[key], depth + 1);
  };
  $('script[type="application/ld+json"]').slice(0, 20).each((_, el) => {
    const raw = $(el).text(); if (raw.length > 150000) return;
    try { visit(JSON.parse(raw), 0); } catch { /* Invalid metadata is not evidence. */ }
  });
  const byId = new Map(nodes.filter(n => typeof n['@id'] === 'string').map(n => [n['@id'], n]));
  const resolve = (value: unknown) => object(value)?.['@id'] ? byId.get(object(value)!['@id']) || value : value;
  for (const node of nodes) {
    if (![node['@type']].flat().some(t => t === 'MusicEvent' || t === 'Event')) continue;
    const performers = [node.performer].flat().map(v => name(resolve(v))).filter((v): v is string => !!v).slice(0, 10);
    const url = link(node.url || node['@id'], finalUrl);
    const startDate = text(node.startDate, 100), day = startDate?.slice(0, 10);
    claims.push({ name: text(node.name), artist: performers.length === 1 ? performers[0] : null, performers,
      venue: name(resolve(node.location)), eventDate: day && validDay(day) ? day : null, startDate,
      promoter: name(resolve(node.organizer)), eventStatus: text(node.eventStatus), url,
      matchesSourcePage: !!url && pageKey(url) === pageKey(finalUrl), sourceUrl: finalUrl, evidenceType: 'publisher_json_ld' });
  }
  // A single Event object embedded on its own page can omit url/@id. Keep
  // provenance explicit; never make this inference when the page lists events.
  if (claims.length === 1 && !claims[0].url) claims[0] = { ...claims[0], url: finalUrl, matchesSourcePage: true };
  $('script,style,noscript,iframe,svg,form,[hidden],[aria-hidden="true"]').remove();
  const emails = new Map<string, { email: string; context: string; pressRoleMentioned: boolean; sourceUrl: string }>();
  $('a[href^="mailto:"]').slice(0, 50).each((_, el) => {
    const email = ($(el).attr('href') || '').slice(7).split('?')[0].trim().toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) || email.length > 254) return;
    const context = text($(el).parent().text(), 350) || '';
    emails.set(email, { email, context, pressRoleMentioned: /\b(press|presse|akkreditering|accreditation|publicist)\b/i.test(context), sourceUrl: finalUrl });
  });
  const pressLinks = new Map<string, { url: string; label: string }>();
  $('a[href]').slice(0, 500).each((_, el) => {
    const label = text($(el).text(), 160) || '', raw = $(el).attr('href');
    if (!/presse|press|accredit|akkredit|kontakt|contact/i.test(`${label} ${raw}`)) return;
    const url = link(raw, finalUrl); if (url && pressLinks.size < 20) pressLinks.set(url, { url, label });
  });
  $('nav,header,footer').remove();
  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');
  root.find('p,h1,h2,h3,li,br').each((_, el) => { $(el).append('\n'); });
  const fullText = root.text().replace(/\s+/g, ' ').trim();
  return { url: finalUrl, title, retrievedAt: now, contentHash: hash({ html }),
    text: fullText.slice(0, 12000), textTruncated: fullText.length > 12000,
    events: [...new Map(claims.map(c => [hash(c), c])).values()].slice(0, 30),
    publishedEmails: [...emails.values()], pressLinks: [...pressLinks.values()],
    untrustedContent: true, independentlyVerified: false };
}
export async function readAccreditationEventSource(value: string) {
  const url = publicEventUrl(value);
  const response = await readPressMedia(url, 'html', 10000);
  return parseAccreditationEventSource(response.bytes.toString('utf8'), response.finalUrl);
}
