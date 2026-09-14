import { extractCandidateImagesFromHtml } from '@/lib/liv/fetch-official-images';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { extractLivPhotoCredit } from '@/lib/liv/photo-credit';
import { sourceUrl } from '@/lib/factcheck/source-reader';
import { imageGenHash } from './article';

export type ImageGenPressCandidate = { id: string; sourceUrl: string; originalUrl: string;
  credit: string | null; rightsStatus: 'unknown'; checkedAt: string };

/** Only URLs returned as search provenance, never model-invented image URLs. */
export function imageGenSearchSources(response: unknown): string[] {
  const found = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    try { found.add(sourceUrl(value).href); } catch { /* Unusable URL. */ }
  };
  const output = (response as { output?: unknown[] })?.output;
  for (const item of Array.isArray(output) ? output : []) {
    const row = item as { type?: string; action?: { sources?: { url?: unknown }[] }; content?: { annotations?: { type?: string; url?: unknown }[] }[] };
    if (row.type === 'web_search_call') for (const source of row.action?.sources ?? []) add(source.url);
    if (row.type === 'message') for (const part of row.content ?? []) {
      for (const annotation of part.annotations ?? []) if (annotation.type === 'url_citation') add(annotation.url);
    }
  }
  return [...found].slice(0, 4);
}

export async function inspectImageGenPressSources(urls: string[]) {
  const candidates: ImageGenPressCandidate[] = [];
  const inspected = await Promise.allSettled(urls.slice(0, 4).map(async source => {
    const sourcePage = sourceUrl(source).href;
    const html = (await readPublicMedia(sourcePage, 'html', 8000)).toString('utf8');
    return extractCandidateImagesFromHtml(html, sourcePage).slice(0, 3).map(originalUrl => ({
      id: imageGenHash(`${sourcePage}\n${originalUrl}`), sourceUrl: sourcePage, originalUrl,
      credit: extractLivPhotoCredit(html, originalUrl, sourcePage), rightsStatus: 'unknown' as const,
      checkedAt: new Date().toISOString(),
    }));
  }));
  for (const result of inspected) if (result.status === 'fulfilled') for (const row of result.value) {
    if (!candidates.some(c => c.originalUrl === row.originalUrl)) candidates.push(row);
  }
  return { candidates: candidates.slice(0, 8), pagesAttempted: urls.slice(0, 4).length,
    pagesRead: inspected.filter(result => result.status === 'fulfilled').length };
}
