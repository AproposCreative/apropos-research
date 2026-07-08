/** Udtræk artikel-slug fra aproposmagazine.com URL eller rå slug. */
export function parseArticleSlug(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const match = url.pathname.match(/\/articles\/([^/]+)\/?$/i);
      if (match?.[1]) return decodeURIComponent(match[1]).trim();
      return null;
    }
  } catch {
    return null;
  }

  const slug = raw.replace(/^\/+|\/+$/g, '');
  if (!slug || /\s/.test(slug)) return null;
  return slug;
}
