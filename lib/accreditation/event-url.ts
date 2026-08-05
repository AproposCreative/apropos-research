import * as cheerio from 'cheerio';
import { getOpenAIClient } from '@/lib/openai';
import { appendAiAudit } from '@/lib/accreditation/audit-store';
import { composeLivSystemPrompt } from '@/lib/accreditation/liv-system-prompt';
import { resolveAccreditationModelForTask } from '@/lib/accreditation/models';

export type EventPageExtraction = {
  url: string;
  artist: string;
  venue?: string;
  eventDate?: string;
  promoter?: string;
  contactEmail?: string;
  contactName?: string;
  title?: string;
  descriptionSnippet?: string;
  confidence: number;
  notes: string;
};

const FETCH_TIMEOUT_MS = 18_000;
const MAX_HTML_CHARS = 180_000;

const VENUE_SLUG_HINTS: Array<{ match: RegExp; label: string }> = [
  { match: /k-?b-?hallen|kb-hallen/i, label: 'K.B. Hallen' },
  { match: /royal-?arena/i, label: 'Royal Arena' },
  { match: /\bvega\b/i, label: 'VEGA' },
  { match: /forum-?copenhagen|forum-?k[oø]benhavn/i, label: 'Forum Copenhagen' },
  { match: /tivoli\b/i, label: 'Tivoli' },
  { match: /store-?vega/i, label: 'Store VEGA' },
  { match: /lille-?vega/i, label: 'Lille VEGA' },
  { match: /amager-?bio/i, label: 'Amager Bio' },
  { match: /pumpehuset/i, label: 'Pumpehuset' },
  { match: /dr-?koncerthuset|koncerthuset/i, label: 'DR Koncerthuset' },
];

function absoluteUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function isAbortLike(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; code?: number };
  return (
    e.name === 'AbortError' ||
    e.code === 20 ||
    /aborted|timeout|timed out/i.test(String(e.message || ''))
  );
}

function titleCaseSlugPart(part: string): string {
  if (/^[a-z]\.?$/i.test(part)) return part.toUpperCase();
  if (part.length <= 2) return part.toUpperCase();
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

/**
 * Best-effort artist/venue from ticket URL slugs when the page itself is blocked/slow
 * (common for Billetlugen/Ticketmaster from some hosts).
 */
export function hintsFromEventUrl(url: string): Partial<EventPageExtraction> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {};
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const promoter = /billetlugen|ticketmaster/i.test(host)
    ? host.includes('billetlugen')
      ? 'Billetlugen'
      : 'Ticketmaster'
    : undefined;

  const eventMatch = parsed.pathname.match(/\/event\/([^/?#]+)/i);
  if (!eventMatch) {
    return { url: parsed.toString(), promoter, confidence: 0.15, notes: 'Kun host/promoter fra URL' };
  }

  let slug = decodeURIComponent(eventMatch[1]).replace(/\/+$/, '');
  slug = slug.replace(/-\d{4,}$/u, '');
  const lower = slug.toLowerCase();

  let venue: string | undefined;
  let artistSlug = slug;
  for (const hint of VENUE_SLUG_HINTS) {
    if (hint.match.test(lower)) {
      venue = hint.label;
      artistSlug = lower.replace(hint.match, '').replace(/^-+|-+$/g, '').replace(/--+/g, '-');
      break;
    }
  }

  const artistParts = artistSlug.split(/[-_]+/).filter(Boolean);
  const artist = artistParts.map(titleCaseSlugPart).join(' ').trim();

  return {
    url: parsed.toString(),
    artist: artist || undefined,
    venue,
    promoter,
    confidence: artist ? 0.55 : 0.2,
    notes: 'URL-slug (side kunne ikke hentes)',
  };
}

function extractJsonLdEvents(html: string): Array<Record<string, unknown>> {
  const $ = cheerio.load(html);
  const events: Array<Record<string, unknown>> = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() || '';
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const t = String((item as { '@type'?: string })['@type'] || '');
        if (/Event/i.test(t)) events.push(item as Record<string, unknown>);
        const graph = (item as { '@graph'?: unknown })['@graph'];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if (
              g &&
              typeof g === 'object' &&
              /Event/i.test(String((g as { '@type'?: string })['@type'] || ''))
            ) {
              events.push(g as Record<string, unknown>);
            }
          }
        }
      }
    } catch {
      /* ignore bad json-ld */
    }
  });
  return events;
}

function textFromLocation(loc: unknown): string | undefined {
  if (!loc) return undefined;
  if (typeof loc === 'string') return loc;
  if (typeof loc === 'object' && loc !== null) {
    const o = loc as { name?: string; address?: unknown };
    if (o.name) return String(o.name);
    if (typeof o.address === 'string') return o.address;
    if (o.address && typeof o.address === 'object') {
      const a = o.address as { name?: string; streetAddress?: string; addressLocality?: string };
      return [a.name, a.streetAddress, a.addressLocality].filter(Boolean).join(', ') || undefined;
    }
  }
  return undefined;
}

function heuristicFromHtml(url: string, html: string): EventPageExtraction {
  const $ = cheerio.load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '')
    .replace(/\s+/g, ' ')
    .trim();
  const description = (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  const ld = extractJsonLdEvents(html)[0];
  let artist = '';
  let venue: string | undefined;
  let eventDate: string | undefined;
  let promoter: string | undefined;

  if (ld) {
    artist = String(ld.name || '').trim();
    eventDate = ld.startDate ? String(ld.startDate).slice(0, 32) : undefined;
    venue = textFromLocation(ld.location);
    const org = ld.organizer;
    if (typeof org === 'string') promoter = org;
    else if (org && typeof org === 'object') {
      promoter = String((org as { name?: string }).name || '') || undefined;
    }
  }

  if (!artist && title) {
    artist = title.split(/[|–—:@]/)[0].trim().slice(0, 80);
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
  const emailMatch = bodyText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const pressEmail =
    bodyText.match(
      /(?:presse|press|media|akkredit)[^\s]{0,40}([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i
    )?.[1] || emailMatch?.[0];

  const urlHints = hintsFromEventUrl(url);

  return {
    url,
    artist: artist || urlHints.artist || 'Ukendt event',
    venue: venue || urlHints.venue,
    eventDate,
    promoter: promoter || urlHints.promoter,
    contactEmail: pressEmail?.toLowerCase(),
    title: title || undefined,
    descriptionSnippet: description || bodyText.slice(0, 280) || undefined,
    confidence: ld ? 0.75 : artist ? 0.45 : urlHints.confidence || 0.2,
    notes: ld ? 'JSON-LD Event' : artist ? 'og:title/heuristic' : urlHints.notes || 'heuristic',
  };
}

async function fetchOnce(
  url: string,
  headers: Record<string, string>
): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!/html|text|xml/i.test(ct) && ct) throw new Error(`Uventet content-type: ${ct}`);
    const html = (await res.text()).slice(0, MAX_HTML_CHARS);
    if (html.length < 80 && /access denied|just a moment|cf-browser-verification/i.test(html)) {
      throw new Error('Event-siden blokerede automatisk adgang');
    }
    return { html, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchEventPageHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  // Browser-like UA is often blocked (403) on ticket hosts; prefer a light bot UA, then bare Accept.
  const attempts: Array<Record<string, string>> = [
    {
      'User-Agent': 'AproposMagazine-Liv/1.0 (+accreditation desk)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'da-DK,da;q=0.9,en;q=0.8',
    },
    {
      Accept: 'text/html',
    },
  ];

  let lastError: unknown;
  for (const headers of attempts) {
    try {
      return await fetchOnce(url, headers);
    } catch (err) {
      lastError = err;
    }
  }

  if (isAbortLike(lastError)) {
    throw new Error('Event-siden svarede ikke i tide. Prøv igen om et øjeblik.');
  }
  throw lastError instanceof Error ? lastError : new Error('Kunne ikke hente event-siden');
}

async function refineWithOpenAi(
  finalUrl: string,
  base: EventPageExtraction,
  plain: string
): Promise<EventPageExtraction> {
  const openai = getOpenAIClient();
  if (!openai) return base;

  try {
    const composed = composeLivSystemPrompt({
      task: 'url_extract',
      includeFacts: false,
      taskInstructions:
        'Udtræk koncert/event-fakta. Returnér JSON: artist, venue?, eventDate?, promoter?, contactEmail?, contactName?, confidence(0-1), notes. Gæt ikke emails.',
    });
    const model = resolveAccreditationModelForTask('url_extract');
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: composed.prompt },
        {
          role: 'user',
          content: `URL: ${finalUrl}\nTitel: ${base.title || ''}\n\nTekst:\n${plain}`,
        },
      ],
      response_format: { type: 'json_object' },
    });
    await appendAiAudit({
      type: 'ai_url_extract',
      detail: `URL extract ${finalUrl}`,
      model,
      promptVersion: composed.promptVersion,
      task: composed.task,
      lane: composed.lane,
    });
    const raw = JSON.parse(
      completion.choices[0]?.message?.content || '{}'
    ) as Partial<EventPageExtraction>;
    return {
      url: finalUrl,
      artist: String(raw.artist || base.artist).trim() || base.artist,
      venue: raw.venue ? String(raw.venue) : base.venue,
      eventDate: raw.eventDate ? String(raw.eventDate).slice(0, 32) : base.eventDate,
      promoter: raw.promoter ? String(raw.promoter) : base.promoter,
      contactEmail: raw.contactEmail ? String(raw.contactEmail).toLowerCase() : base.contactEmail,
      contactName: raw.contactName ? String(raw.contactName) : base.contactName,
      title: base.title,
      descriptionSnippet: base.descriptionSnippet,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : base.confidence,
      notes: [base.notes, raw.notes].filter(Boolean).join('; '),
    };
  } catch {
    return base;
  }
}

export async function extractEventFromUrl(url: string): Promise<EventPageExtraction> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Ugyldig event-URL');
  }
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error('Kun http(s) URLs');

  const urlHints = hintsFromEventUrl(parsed.toString());

  try {
    const { html, finalUrl } = await fetchEventPageHtml(parsed.toString());
    const base = heuristicFromHtml(finalUrl, html);
    const plain = cheerio.load(html)('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000);
    return refineWithOpenAi(finalUrl, base, plain);
  } catch (fetchErr) {
    // Page blocked/timed out — still advance the wizard from slug + optional LLM on URL alone.
    const base: EventPageExtraction = {
      url: parsed.toString(),
      artist: urlHints.artist || 'Ukendt event',
      venue: urlHints.venue,
      promoter: urlHints.promoter,
      confidence: urlHints.confidence ?? 0.35,
      notes: [
        urlHints.notes || 'URL-slug',
        fetchErr instanceof Error ? fetchErr.message : 'fetch failed',
      ].join('; '),
    };
    if (!urlHints.artist) {
      throw fetchErr instanceof Error
        ? fetchErr
        : new Error('Liv kunne ikke læse eventlinket');
    }
    return refineWithOpenAi(
      parsed.toString(),
      base,
      `Kun URL tilgængelig (side hentning fejlede).\nURL: ${parsed.toString()}\nGæt artist/venue fra slug hvis tydeligt.`
    );
  }
}

/** Resolve relative ticket links against page URL (helper for tests/delivery). */
export function resolvePageLink(pageUrl: string, href: string): string | null {
  return absoluteUrl(pageUrl, href);
}
