/**
 * Webflow felt-mapping & transformation.
 *
 * Pure helpers (ingen netværk, ingen state) der bruges af article-publisher
 * til at konvertere artikel-data til Webflow's `fieldData`-payload.
 * Lavet som rene funktioner så de kan unit-testes uafhængigt af resten af
 * service-laget.
 */

/** Konvertér en værdi til en Webflow-feltværdi baseret på mapping-type. */
export function transformValue(value: unknown, t?: string): unknown {
  switch (t) {
    case 'plainToHtml': {
      if (!value) return value;
      const str = String(value).trim();
      if (!str) return str;
      if (/<\w+/i.test(str)) return str;
      const paragraphs = str
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => `<p>${block.replace(/\n+/g, '<br/>')}</p>`);
      return paragraphs.length > 0 ? paragraphs.join('') : `<p>${str}</p>`;
    }
    case 'markdownToHtml':
      if (!value) return value;
      return String(value).replace(/^# (.*)$/gm, '<h2>$1</h2>').replace(/\n\n/g, '<br/><br/>');
    case 'stringArray':
      if (Array.isArray(value)) return value;
      if (!value) return [];
      return String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    case 'dateIso':
      return value ? new Date(value as string | number | Date).toISOString() : undefined;
    case 'referenceId':
      return value;
    case 'multiReferenceId':
      if (Array.isArray(value)) return value;
      if (!value) return [];
      return [value];
    case 'boolean':
      // Omit field entirely when value is undefined/null so we don't
      // overwrite an existing Webflow value with `false` when the user
      // simply didn't set it in the wizard. Empty string is also treated
      // as "not provided".
      if (value === undefined || value === null || value === '') return undefined;
      return !!value;
    case 'number':
      return value === undefined || value === null || value === ''
        ? undefined
        : Number(value);
    case 'cleanIntro': {
      if (!value) return value;
      const introText = String(value).trim();
      if (!introText) return introText;
      return introText
        .replace(/^intro\s*:\s*/im, '')
        .replace(/^jeg\s+satte\s+mig[^.]*\.\s*/im, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    case 'identity':
    default:
      return value;
  }
}

export function isLikelyUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = String(value).trim();
  return /^https?:\/\//i.test(trimmed);
}

export function extractFirstYouTubeUrl(text: string): string | undefined {
  if (!text) return undefined;
  const regex = /(https?:\/\/[^\s]*?(?:youtube\.com\/[\w?=&-]+|youtu\.be\/[\w-]+))/i;
  const match = text.match(regex);
  return match ? match[1] : undefined;
}

export function normalizeYouTubeUrl(url: string): string | undefined {
  if (!url) return undefined;
  let candidate = url.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('youtube.com') && !host.includes('youtu.be')) {
      return undefined;
    }
    let videoId = '';
    if (host.includes('youtu.be')) {
      videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
    } else if (parsed.pathname.startsWith('/watch')) {
      videoId = parsed.searchParams.get('v') || '';
    } else if (parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/')[2] || parsed.pathname.split('/')[1] || '';
    } else if (parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.split('/')[2] || '';
    }
    videoId = videoId.replace(/[^A-Za-z0-9_-]/g, '');
    if (!videoId) return undefined;
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return undefined;
  }
}

/** Strip HTML tags fra rich text-felter mens linjeskift bevares. */
export function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
