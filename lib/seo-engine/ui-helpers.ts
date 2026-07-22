import type { AllowlistedFieldPath, PublishFields, SeoField } from '@/lib/seo-engine/schema';

export const EDITOR_FIELD_ORDER: AllowlistedFieldPath[] = [
  'seoTitle',
  'metaDescription',
  'slug',
  'canonical',
  'ogTitle',
  'ogDescription',
  'primaryPhrase',
  'supportingTopics',
  'tags',
  'section',
  'imageAlt',
  'imageCaption',
  'internalLinks',
  'externalLinks',
  'jsonLd',
];

export function fieldValueAsEditableString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function parseEditableString(fieldPath: AllowlistedFieldPath, text: string): unknown {
  if (
    fieldPath === 'supportingTopics' ||
    fieldPath === 'tags' ||
    fieldPath === 'internalLinks' ||
    fieldPath === 'externalLinks' ||
    fieldPath === 'jsonLd' ||
    fieldPath === 'imageCaption'
  ) {
    const t = text.trim();
    if (!t) return fieldPath === 'imageCaption' ? null : [];
    try {
      return JSON.parse(t);
    } catch {
      if (fieldPath === 'supportingTopics' || fieldPath === 'tags') {
        return t.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      }
      throw new Error('Ugyldig JSON for feltet');
    }
  }
  return text;
}

export function buildCopyBundle(fields: Partial<PublishFields> | undefined): string {
  if (!fields) return '';
  const lines: string[] = [];
  for (const key of EDITOR_FIELD_ORDER) {
    const f = fields[key] as SeoField<unknown> | undefined;
    if (!f) continue;
    lines.push(`${key}: ${fieldValueAsEditableString(f.value)}`);
  }
  return lines.join('\n');
}

/** Build copy text from editable strings; skips fields with invalid JSON instead of throwing. */
export function buildCopyBundleFromEditable(
  edits: Partial<Record<AllowlistedFieldPath, { value: string }>>
): { text: string; skipped: AllowlistedFieldPath[] } {
  const skipped: AllowlistedFieldPath[] = [];
  const lines: string[] = [];
  for (const key of EDITOR_FIELD_ORDER) {
    const raw = edits[key]?.value;
    if (raw == null) continue;
    try {
      const value = parseEditableString(key, raw);
      lines.push(`${key}: ${fieldValueAsEditableString(value)}`);
    } catch {
      skipped.push(key);
    }
  }
  return { text: lines.join('\n'), skipped };
}

export function parseRelatedAproposText(text: string): Array<{
  id?: string;
  url?: string;
  title?: string;
}> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 2 && /^https?:\/\//i.test(parts[0])) {
        return { url: parts[0], title: parts.slice(1).join(' | ') || undefined };
      }
      if (parts.length >= 2 && /^https?:\/\//i.test(parts[1])) {
        return { title: parts[0] || undefined, url: parts[1] };
      }
      if (/^https?:\/\//i.test(line)) return { url: line };
      return { title: line };
    });
}

export function relatedAproposToText(
  articles: Array<{ id?: string; url?: string; title?: string }> | undefined
): string {
  if (!articles?.length) return '';
  return articles
    .map((a) => {
      if (a.url && a.title) return `${a.title} | ${a.url}`;
      return a.url || a.title || a.id || '';
    })
    .filter(Boolean)
    .join('\n');
}

export function selectDiffPair(
  versionIds: string[],
  a?: string | null,
  b?: string | null
): { a: string | null; b: string | null } {
  const first = a && versionIds.includes(a) ? a : versionIds[0] || null;
  const second =
    b && versionIds.includes(b) && b !== first
      ? b
      : versionIds.find((id) => id !== first) || null;
  return { a: first, b: second };
}

/** Canonical SEO Engine article types (UI + prompt alignment). Keep extras that remain useful. */
export const ARTICLE_TYPE_OPTIONS = [
  '',
  'Filmanmeldelse',
  'Serieanmeldelse',
  'Koncertanmeldelse',
  'Festivalanmeldelse',
  'Albumanmeldelse',
  'Spilanmeldelse',
  'Teateranmeldelse',
  'Kunstanmeldelse',
  'Kulturkommentar',
  'Essay',
  'Interview',
  'Portræt',
  'Nyhed',
  'Guide',
  'Festivalguide',
  'Streamingguide',
  'Feature',
  'Rejseartikel',
  'Andet',
  // Extra / legacy labels still used in heuristics and older content
  'Anmeldelse',
  'Liste',
  'Opinion',
] as const;

export type ArticleTypeOption = (typeof ARTICLE_TYPE_OPTIONS)[number];
