/**
 * Deterministic Arkiv content fixes: internal links, H2/H3 structure, canonical URL.
 * CMS fields (from webflow-mapping + archive-audit):
 *   - body rich text → `content`
 *   - canonical → `canonical-url` (fallback read: `canonical`)
 * No invented external URLs; Apropos article allowlist only.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARCHIVE_CONTENT_MAX_BATCH } from '@/lib/seo-engine/archive-audit-apply-constants';

export { ARCHIVE_CONTENT_MAX_BATCH } from '@/lib/seo-engine/archive-audit-apply-constants';

export const CMS_BODY_FIELD = 'content';
export const CMS_CANONICAL_FIELD = 'canonical-url';
export const CMS_CANONICAL_FIELD_FALLBACK = 'canonical';
export const CMS_THUMB_FIELD = 'thumb';

export const APROPOS_SITE_ORIGIN = 'https://www.aproposmagazine.com';
export const APROPOS_ARTICLE_PATH_PREFIX = '/articles/';

/** Soft caps — body writes are riskier than SEO title/meta. */
export const ARCHIVE_CONTENT_MAX_LINKS_PER_ARTICLE = 3;
export const ARCHIVE_CONTENT_MAX_HEADINGS_INSERT = 2;

export type ArchiveFixKind =
  | 'seo_meta'
  | 'internal_links'
  | 'headings'
  | 'canonical'
  | 'image_alt';

export const ARCHIVE_FIX_KIND_LABELS: Record<ArchiveFixKind, string> = {
  seo_meta: 'SEO-title + meta',
  internal_links: 'Interne links',
  headings: 'Overskrifter',
  canonical: 'Canonical',
  image_alt: 'Billede-alt',
};

export type ContentFixKind = Exclude<ArchiveFixKind, 'seo_meta'>;

export type InternalLinkCatalogEntry = {
  url: string;
  title: string;
  slug: string;
};

export type ProposedInternalLink = {
  url: string;
  title: string;
  anchorText: string;
  snippetBefore: string;
  snippetAfter: string;
};

export type ProposedHeading = {
  level: 2 | 3;
  text: string;
  /** Approx index among <p> blocks where heading is inserted before. */
  beforeParagraphIndex: number;
  snippet: string;
};

export type ContentFixProposal = {
  itemId: string;
  locale: 'da' | 'en';
  title: string;
  slug: string;
  kinds: ContentFixKind[];
  oldContent: string;
  newContent: string;
  contentChanged: boolean;
  oldCanonical: string | null;
  newCanonical: string | null;
  canonicalChanged: boolean;
  oldThumbAlt: string | null;
  newThumbAlt: string | null;
  thumbAltChanged: boolean;
  /** Full thumb object when patching alt (preserve url/fileId). */
  newThumb: Record<string, unknown> | null;
  links: ProposedInternalLink[];
  headings: ProposedHeading[];
  contentHashBefore: string;
  lastUpdated: string | null;
};

export function normalizeAproposArticleUrl(raw: string): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  try {
    const u = new URL(t.startsWith('http') ? t : `${APROPOS_SITE_ORIGIN}${t.startsWith('/') ? '' : '/'}${t}`);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'aproposmagazine.com') return null;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (!path.toLowerCase().startsWith(APROPOS_ARTICLE_PATH_PREFIX)) return null;
    const slug = path.slice(APROPOS_ARTICLE_PATH_PREFIX.length).split('/')[0] || '';
    if (!slug || slug.includes('..')) return null;
    return `${APROPOS_SITE_ORIGIN}${APROPOS_ARTICLE_PATH_PREFIX}${slug}`;
  } catch {
    return null;
  }
}

export function isAllowedAproposArticleUrl(url: string): boolean {
  return normalizeAproposArticleUrl(url) != null;
}

export function buildCanonicalForSlug(slug: string): string {
  const s = String(slug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  return `${APROPOS_SITE_ORIGIN}${APROPOS_ARTICLE_PATH_PREFIX}${s}`;
}

export function readCmsCanonical(fieldData: Record<string, unknown>): string | null {
  const primary = String(fieldData[CMS_CANONICAL_FIELD] || '').trim();
  if (primary) return primary;
  const fallback = String(fieldData[CMS_CANONICAL_FIELD_FALLBACK] || '').trim();
  return fallback || null;
}

export function readCmsBody(fieldData: Record<string, unknown>): string {
  return String(fieldData[CMS_BODY_FIELD] || '');
}

export function hashBodyContent(html: string): string {
  return createHash('sha256').update(html || '', 'utf8').digest('hex');
}

export function slugFromArticleUrl(url: string): string {
  const n = normalizeAproposArticleUrl(url);
  if (!n) return '';
  return n.slice(`${APROPOS_SITE_ORIGIN}${APROPOS_ARTICLE_PATH_PREFIX}`.length);
}

/** Load allowlisted internal targets from data/apropos-articles.json (same-site only). */
export function loadInternalLinkCatalog(opts?: {
  path?: string;
  raw?: Array<{ url?: string; title?: string }>;
}): InternalLinkCatalogEntry[] {
  let rows: Array<{ url?: string; title?: string }> = opts?.raw || [];
  if (!opts?.raw) {
    const p = opts?.path || join(process.cwd(), 'data', 'apropos-articles.json');
    try {
      rows = JSON.parse(readFileSync(p, 'utf8')) as Array<{ url?: string; title?: string }>;
    } catch {
      rows = [];
    }
  }
  const out: InternalLinkCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const url = normalizeAproposArticleUrl(String(row.url || ''));
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = String(row.title || '').trim();
    if (!title || title.length < 4) continue;
    out.push({ url, title, slug: slugFromArticleUrl(url) });
  }
  return out;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function existingInternalHrefs(html: string): Set<string> {
  const set = new Set<string>();
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const n = normalizeAproposArticleUrl(m[1] || '');
    if (n) set.add(n);
  }
  return set;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split HTML into outside-`<a>` segments so we only wrap plain text.
 */
function mapPlainTextOutsideAnchors(
  html: string,
  replacer: (plain: string) => { text: string; changed: boolean }
): { html: string; changed: boolean } {
  const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi);
  let changed = false;
  const out = parts.map((part) => {
    if (/^<a\b/i.test(part)) return part;
    const r = replacer(part);
    if (r.changed) changed = true;
    return r.text;
  });
  return { html: out.join(''), changed };
}

function titleAnchorCandidates(title: string): string[] {
  const clean = title
    .replace(/\s*[|:–—-]\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const candidates = [clean];
  // Drop common review prefixes for matching
  const stripped = clean.replace(
    /^(anmeldelse|anbefaling|guide|live)\s*(af|til|:)?\s*/i,
    ''
  );
  if (stripped && stripped !== clean) candidates.push(stripped);
  // First 2–5 significant words
  const words = clean.split(/\s+/).filter((w) => w.length > 2);
  if (words.length >= 2) {
    candidates.push(words.slice(0, Math.min(4, words.length)).join(' '));
  }
  return [...new Set(candidates.map((c) => c.trim()).filter((c) => c.length >= 4))];
}

export function proposeInternalLinks(args: {
  html: string;
  selfSlug: string;
  catalog: InternalLinkCatalogEntry[];
  maxLinks?: number;
}): { html: string; links: ProposedInternalLink[] } {
  const maxLinks = Math.max(0, args.maxLinks ?? ARCHIVE_CONTENT_MAX_LINKS_PER_ARTICLE);
  const used = existingInternalHrefs(args.html);
  const selfNorm = normalizeAproposArticleUrl(
    `${APROPOS_SITE_ORIGIN}${APROPOS_ARTICLE_PATH_PREFIX}${args.selfSlug}`
  );
  if (selfNorm) used.add(selfNorm);

  const links: ProposedInternalLink[] = [];
  let html = args.html;

  // Score catalog by longest anchor match present in plain text
  type Cand = { entry: InternalLinkCatalogEntry; anchor: string; score: number };
  const cands: Cand[] = [];
  const plain = stripTags(html).toLowerCase();
  for (const entry of args.catalog) {
    if (used.has(entry.url)) continue;
    if (entry.slug && entry.slug === args.selfSlug) continue;
    for (const anchor of titleAnchorCandidates(entry.title)) {
      if (anchor.length < 4 || anchor.length > 80) continue;
      if (!plain.includes(anchor.toLowerCase())) continue;
      cands.push({ entry, anchor, score: anchor.length });
    }
  }
  cands.sort((a, b) => b.score - a.score);

  for (const cand of cands) {
    if (links.length >= maxLinks) break;
    if (used.has(cand.entry.url)) continue;

    let inserted = false;
    const mapped = mapPlainTextOutsideAnchors(html, (segment) => {
      if (inserted) return { text: segment, changed: false };
      const re = new RegExp(`(^|[^\\wÆØÅæøå])(${escapeRegExp(cand.anchor)})(?=[^\\wÆØÅæøå]|$)`, 'i');
      const m = re.exec(segment);
      if (!m || m.index == null) return { text: segment, changed: false };
      const full = m[0];
      const prefix = m[1] || '';
      const matched = m[2] || cand.anchor;
      const start = m.index;
      const before = segment.slice(Math.max(0, start - 40), start);
      const after = segment.slice(start + full.length, start + full.length + 40);
      const replacement = `${prefix}<a href="${cand.entry.url}">${matched}</a>`;
      const next =
        segment.slice(0, start) + replacement + segment.slice(start + full.length);
      inserted = true;
      links.push({
        url: cand.entry.url,
        title: cand.entry.title,
        anchorText: matched,
        snippetBefore: before.trim(),
        snippetAfter: after.trim(),
      });
      used.add(cand.entry.url);
      return { text: next, changed: true };
    });
    if (mapped.changed) html = mapped.html;
  }

  return { html, links };
}

/**
 * Promote first sentence of selected long paragraphs into H2, keeping remainder in <p>.
 * Only when heading count is below target — preserves voice by using the article's own words.
 */
export function proposeHeadingStructure(args: {
  html: string;
  language?: 'da' | 'en';
  maxInsert?: number;
}): { html: string; headings: ProposedHeading[] } {
  const maxInsert = Math.max(0, args.maxInsert ?? ARCHIVE_CONTENT_MAX_HEADINGS_INSERT);
  const existing = (args.html.match(/<h[1-6]\b/gi) || []).length;
  if (existing >= 2 || maxInsert === 0) {
    return { html: args.html, headings: [] };
  }
  const need = Math.min(maxInsert, 2 - existing);
  if (need <= 0) return { html: args.html, headings: [] };

  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: Array<{ full: string; inner: string; index: number; start: number }> = [];
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = pRe.exec(args.html))) {
    paragraphs.push({
      full: m[0],
      inner: m[1] || '',
      index: idx++,
      start: m.index,
    });
  }
  if (paragraphs.length < 3) return { html: args.html, headings: [] };

  const pickIdx: number[] = [];
  if (paragraphs.length >= 4) {
    pickIdx.push(Math.floor(paragraphs.length / 3));
    if (need > 1) pickIdx.push(Math.floor((2 * paragraphs.length) / 3));
  } else {
    pickIdx.push(1);
  }

  const headings: ProposedHeading[] = [];
  let html = args.html;
  // Apply from end so indices stay valid
  const uniquePicks = [...new Set(pickIdx)].slice(0, need).sort((a, b) => b - a);

  for (const pIndex of uniquePicks) {
    const p = paragraphs[pIndex];
    if (!p) continue;
    const plain = stripTags(p.inner).trim();
    if (plain.length < 40) continue;
    const sentenceMatch = plain.match(/^(.{12,90}?[.!?])(\s|$)/);
    const headingText = (sentenceMatch?.[1] || plain.slice(0, 70)).trim();
    if (headingText.length < 12) continue;

    let newBlock: string;
    if (sentenceMatch?.[1] && plain.length > sentenceMatch[1].length + 8) {
      const rest = plain.slice(sentenceMatch[1].length).trim();
      newBlock = `<h2>${escapeHtmlText(headingText)}</h2>\n<p>${escapeHtmlText(rest)}</p>`;
    } else {
      // Keep paragraph; insert heading before with shortened label
      const label =
        headingText.length > 60 ? `${headingText.slice(0, 57).trim()}…` : headingText;
      newBlock = `<h2>${escapeHtmlText(label)}</h2>\n${p.full}`;
    }

    // Replace only this occurrence by position
    const at = html.indexOf(p.full);
    if (at < 0) continue;
    html = html.slice(0, at) + newBlock + html.slice(at + p.full.length);
    headings.unshift({
      level: 2,
      text: headingText,
      beforeParagraphIndex: pIndex,
      snippet: plain.slice(0, 100),
    });
  }

  return { html, headings };
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function proposeCanonicalFix(args: {
  slug: string;
  existing: string | null;
}): { newCanonical: string | null; changed: boolean } {
  const existingNorm = args.existing ? normalizeAproposArticleUrl(args.existing) : null;
  if (existingNorm) {
    return { newCanonical: existingNorm, changed: existingNorm !== args.existing };
  }
  if (args.existing && String(args.existing).trim()) {
    // Non-empty but not allowlisted — do not overwrite silently
    return { newCanonical: null, changed: false };
  }
  if (!args.slug?.trim()) return { newCanonical: null, changed: false };
  return { newCanonical: buildCanonicalForSlug(args.slug), changed: true };
}

function readThumbAlt(fieldData: Record<string, unknown>): string | null {
  const thumb = fieldData[CMS_THUMB_FIELD];
  if (!thumb || typeof thumb !== 'object') return null;
  const alt = String((thumb as { alt?: unknown }).alt || '').trim();
  return alt || null;
}

/**
 * Fill missing thumb.alt and/or body <img> alt from article title (calm, non-spammy).
 */
export function proposeImageAltFix(args: {
  fieldData: Record<string, unknown>;
  title: string;
  html: string;
}): {
  html: string;
  htmlChanged: boolean;
  thumbAlt: string | null;
  thumbChanged: boolean;
  newThumb: Record<string, unknown> | null;
  oldThumbAlt: string | null;
} {
  const titleAlt = String(args.title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const oldThumbAlt = readThumbAlt(args.fieldData);
  let thumbChanged = false;
  let newThumb: Record<string, unknown> | null = null;
  let thumbAlt: string | null = oldThumbAlt;

  const thumb = args.fieldData[CMS_THUMB_FIELD];
  if (thumb && typeof thumb === 'object' && !oldThumbAlt && titleAlt) {
    newThumb = { ...(thumb as Record<string, unknown>), alt: titleAlt };
    thumbAlt = titleAlt;
    thumbChanged = true;
  }

  let html = args.html;
  let htmlChanged = false;
  if (titleAlt && /<img\b/i.test(html)) {
    const next = html.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
      if (/\balt\s*=\s*["'][^"']+["']/i.test(attrs)) return full;
      if (/\balt\s*=\s*["']\s*["']/i.test(attrs)) {
        return `<img${attrs.replace(/\balt\s*=\s*["']\s*["']/i, `alt="${escapeHtmlText(titleAlt)}"`)}>`;
      }
      htmlChanged = true;
      return `<img alt="${escapeHtmlText(titleAlt)}"${attrs}>`;
    });
    if (next !== html) {
      html = next;
      htmlChanged = true;
    }
  }

  return {
    html,
    htmlChanged,
    thumbAlt,
    thumbChanged,
    newThumb,
    oldThumbAlt,
  };
}

/**
 * Build a combined content-fix proposal for one locale item.
 */
export function buildContentFixProposal(args: {
  itemId: string;
  locale: 'da' | 'en';
  title: string;
  slug: string;
  fieldData: Record<string, unknown>;
  lastUpdated: string | null;
  kinds: ContentFixKind[];
  catalog: InternalLinkCatalogEntry[];
}): ContentFixProposal {
  const kinds = [...new Set(args.kinds)];
  const oldContent = readCmsBody(args.fieldData);
  const oldCanonical = readCmsCanonical(args.fieldData);
  let newContent = oldContent;
  const links: ProposedInternalLink[] = [];
  const headings: ProposedHeading[] = [];

  if (kinds.includes('internal_links')) {
    const r = proposeInternalLinks({
      html: newContent,
      selfSlug: args.slug,
      catalog: args.catalog,
    });
    newContent = r.html;
    links.push(...r.links);
  }
  if (kinds.includes('headings')) {
    const r = proposeHeadingStructure({ html: newContent, language: args.locale });
    newContent = r.html;
    headings.push(...r.headings);
  }

  let newCanonical: string | null = oldCanonical;
  let canonicalChanged = false;
  if (kinds.includes('canonical')) {
    const c = proposeCanonicalFix({ slug: args.slug, existing: oldCanonical });
    if (c.changed && c.newCanonical) {
      newCanonical = c.newCanonical;
      canonicalChanged = true;
    }
  }

  let oldThumbAlt: string | null = readThumbAlt(args.fieldData);
  let newThumbAlt: string | null = oldThumbAlt;
  let thumbAltChanged = false;
  let newThumb: Record<string, unknown> | null = null;
  if (kinds.includes('image_alt')) {
    const img = proposeImageAltFix({
      fieldData: args.fieldData,
      title: args.title,
      html: newContent,
    });
    if (img.htmlChanged) newContent = img.html;
    if (img.thumbChanged) {
      thumbAltChanged = true;
      newThumbAlt = img.thumbAlt;
      newThumb = img.newThumb;
    }
    oldThumbAlt = img.oldThumbAlt;
  }

  return {
    itemId: args.itemId,
    locale: args.locale,
    title: args.title,
    slug: args.slug,
    kinds,
    oldContent,
    newContent,
    contentChanged: newContent !== oldContent,
    oldCanonical,
    newCanonical: canonicalChanged ? newCanonical : oldCanonical,
    canonicalChanged,
    oldThumbAlt,
    newThumbAlt,
    thumbAltChanged,
    newThumb,
    links,
    headings,
    contentHashBefore: hashBodyContent(oldContent),
    lastUpdated: args.lastUpdated,
  };
}

export function buildCmsPatchFromContentProposal(
  proposal: ContentFixProposal
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (proposal.contentChanged) patch[CMS_BODY_FIELD] = proposal.newContent;
  if (proposal.canonicalChanged && proposal.newCanonical) {
    patch[CMS_CANONICAL_FIELD] = proposal.newCanonical;
  }
  if (proposal.thumbAltChanged && proposal.newThumb) {
    patch[CMS_THUMB_FIELD] = proposal.newThumb;
  }
  return patch;
}

export function normalizeFixKinds(raw: unknown): {
  ok: true;
  kinds: ArchiveFixKind[];
} | { ok: false; reason: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, reason: 'Vælg mindst én fix-type' };
  }
  const allowed = new Set<ArchiveFixKind>([
    'seo_meta',
    'internal_links',
    'headings',
    'canonical',
    'image_alt',
  ]);
  const kinds: ArchiveFixKind[] = [];
  const seen = new Set<string>();
  for (const k of raw) {
    const s = String(k || '').trim() as ArchiveFixKind;
    if (!allowed.has(s)) {
      return { ok: false, reason: `Ukendt fix-type: ${s}` };
    }
    if (seen.has(s)) continue;
    seen.add(s);
    kinds.push(s);
  }
  return { ok: true, kinds };
}
