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

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_CHARS = 180_000;

function absoluteUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
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
            if (g && typeof g === 'object' && /Event/i.test(String((g as { '@type'?: string })['@type'] || ''))) {
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
    else if (org && typeof org === 'object') promoter = String((org as { name?: string }).name || '') || undefined;
  }

  if (!artist && title) {
    artist = title.split(/[|–—:-]/)[0].trim().slice(0, 80);
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
  const emailMatch = bodyText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const pressEmail =
    bodyText.match(/(?:presse|press|media|akkredit)[^\s]{0,40}([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1] ||
    emailMatch?.[0];

  return {
    url,
    artist: artist || 'Ukendt event',
    venue,
    eventDate,
    promoter,
    contactEmail: pressEmail?.toLowerCase(),
    title: title || undefined,
    descriptionSnippet: description || bodyText.slice(0, 280) || undefined,
    confidence: ld ? 0.75 : artist ? 0.45 : 0.2,
    notes: ld ? 'JSON-LD Event' : 'og:title/heuristic',
  };
}

export async function fetchEventPageHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'AproposMagazine-Liv/1.0 (+accreditation desk)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!/html|text|xml/i.test(ct) && ct) throw new Error(`Uventet content-type: ${ct}`);
    const html = (await res.text()).slice(0, MAX_HTML_CHARS);
    return { html, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
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

  const { html, finalUrl } = await fetchEventPageHtml(parsed.toString());
  const base = heuristicFromHtml(finalUrl, html);

  const openai = getOpenAIClient();
  if (!openai) return base;

  try {
    const plain = cheerio.load(html)('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000);
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
    const raw = JSON.parse(completion.choices[0]?.message?.content || '{}') as Partial<EventPageExtraction>;
    return {
      url: finalUrl,
      artist: String(raw.artist || base.artist).trim() || base.artist,
      venue: raw.venue ? String(raw.venue) : base.venue,
      eventDate: raw.eventDate ? String(raw.eventDate) : base.eventDate,
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

/** Resolve relative ticket links against page URL (helper for tests/delivery). */
export function resolvePageLink(pageUrl: string, href: string): string | null {
  return absoluteUrl(pageUrl, href);
}
