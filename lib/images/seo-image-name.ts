/**
 * SEO-venlige filnavne til optimerede artikelbilleder.
 * Slug matcher artikel-URL; rolle angiver thumb / mobile / inline-01 osv.
 */

export function slugifyForFile(input: string): string {
  const normalized = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized.slice(0, 90) || 'apropos-image';
}

function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

/** Primær base for filnavn — slug matcher artikel-URL (bedst for SEO). */
export function resolveArticleSeoImageBaseName(args: {
  slug?: string | null;
  seoTitle?: string | null;
  title?: string | null;
}): string {
  const slug = args.slug?.trim();
  if (slug) return slugifyForFile(slug);

  const seoTitle = args.seoTitle?.trim();
  if (seoTitle) return slugifyForFile(seoTitle);

  const title = args.title?.trim();
  if (title) return slugifyForFile(title);

  return 'apropos-article';
}

export function buildSeoImageFileName(options: {
  baseName?: string;
  role?: string;
  maxLongEdge?: number;
  imageUrl?: string;
}): string {
  const base = slugifyForFile(options.baseName || 'apropos-image');
  const role = slugifyForFile(options.role || 'mobile');
  const width = options.maxLongEdge || 800;
  const hash = shortHash(`${base}|${role}|${options.imageUrl || ''}`);
  return `${base}-${role}-${width}w-${hash}.webp`;
}

export function buildContentImageRole(index: number): string {
  return `inline-${String(index + 1).padStart(2, '0')}`;
}

export function resolveSeoTitleFromFieldData(fieldData: Record<string, unknown>): string | undefined {
  for (const key of ['seo-title', 'seoTitle', 'article-seo-title']) {
    const value = fieldData[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function buildImageAltText(args: {
  seoTitle?: string | null;
  articleTitle?: string | null;
  role: string;
}): string {
  const label = args.seoTitle?.trim() || args.articleTitle?.trim() || 'Apropos Magazine';
  if (args.role === 'thumb') return `${label} — forsidebillede`;
  if (args.role === 'mobile') return `${label} — mobil`;
  if (args.role.startsWith('inline')) {
    const n = args.role.replace(/^inline-0*/, '') || '1';
    return `${label} — billede ${n}`;
  }
  return label;
}
