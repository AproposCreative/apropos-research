import { readPressMedia } from '@/lib/liv/public-media-reader';
import { bytesHash, extractPressCandidates, validatePressRaster, PRESS_POLICY } from './press-candidates';
import { sourceUrl } from '@/lib/factcheck/source-reader';
import { imageGenHash } from './article';

export type ImageGenPressCandidate = { id: string; sourceUrl: string; sourceFinalUrl: string; originalUrl: string; downloadUrl: string;
  credit: string | null; caption: string; creditEvidence: string; sourceHash: string; usageTerms: string[];
  rightsStatus: 'unknown'; checkedAt: string; validation: 'decoded'; mimeType: string; byteCount: number; width: number; height: number; sha256: string };

/** Extract only the assistant's cited search text. Search prose remains
 * untrusted source material and is never treated as an application command. */
export function imageGenSearchText(response: unknown): string {
  const output = (response as { output?: unknown[] })?.output;
  const texts: string[] = [];
  for (const item of Array.isArray(output) ? output : []) {
    const row = item as { type?: string; content?: { type?: string; text?: unknown }[] };
    if (row.type !== 'message') continue;
    for (const part of row.content ?? []) {
      if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
        texts.push(part.text);
      }
    }
  }
  return texts.join('\n\n').replace(/\s+/gu, ' ').trim().slice(0, 2400);
}

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
  const diagnostics: { sourceUrl: string; finalUrl?: string; pageRead: boolean; sourceHash?: string; status?: number; contentType?: string; byteCount?: number; extracted?: number; truncated?: boolean; error?: string; images: { url: string; accepted: boolean; reason: string; status?: number | null; finalUrl?: string; contentType?: string }[] }[] = [];
  // At most four page reads and 24 unique image reads, three at a time. Do not
  // download a whole press archive just to discover that it contains no cover.
  const downloaded = new Map<string, Promise<{ finalUrl: string; validation: Awaited<ReturnType<typeof validatePressRaster>> }>>();
  for (const source of urls.slice(0, 4)) {
    const diagnostic: typeof diagnostics[number] = { sourceUrl: source, pageRead: false, images: [] };
    diagnostics.push(diagnostic);
    try {
      const page = await readPressMedia(sourceUrl(source).href, 'html', 8000);
      const html = page.bytes.toString('utf8'), sourceHash = bytesHash(page.bytes);
      Object.assign(diagnostic, { pageRead: true, finalUrl: page.finalUrl, sourceHash, status: page.status, contentType: page.contentType, byteCount: page.bytes.length });
      const extracted = extractPressCandidates(html, page.finalUrl);
      diagnostic.extracted = extracted.candidates.length;
      diagnostic.images.push(...extracted.skipped.map(item => ({ ...item, accepted: false })));
      const bounded = extracted.candidates.slice(0, 24);
      diagnostic.truncated = extracted.candidates.length > bounded.length;
      for (let offset = 0; offset < bounded.length; offset += 3) {
        await Promise.all(bounded.slice(offset, offset + 3).map(async item => {
          if (!downloaded.has(item.url) && downloaded.size >= 24) { diagnostic.truncated = true; diagnostic.images.push({ url: item.url, accepted: false, reason: 'read_limit' }); return; }
          try {
            if (!downloaded.has(item.url)) downloaded.set(item.url, (async () => {
              const response = await readPressMedia(item.url, 'image', 5000);
              return { finalUrl: response.finalUrl, validation: await validatePressRaster(response) };
            })());
            const { finalUrl, validation } = await downloaded.get(item.url)!;
            diagnostic.images.push({ url: item.url, accepted: true, reason: 'decoded_raster', status: 200, finalUrl, contentType: validation.mimeType });
            if (candidates.some(c => c.sha256 === validation.sha256)) return;
            candidates.push({ id: imageGenHash(`${source}\n${item.url}\n${validation.sha256}`), sourceUrl: source, sourceFinalUrl: page.finalUrl,
              originalUrl: item.url, downloadUrl: finalUrl, credit: item.credit, caption: item.caption, creditEvidence: item.evidence,
              sourceHash, usageTerms: extracted.usageTerms, rightsStatus: 'unknown', checkedAt: new Date().toISOString(), validation: 'decoded', ...validation });
          } catch (error) {
            const code = error instanceof Error && /^(?:press_image_|media_)[a-z_]+$/.test(error.message) ? error.message : 'press_image_fetch_failed';
            const detail = error as { status?: number; finalUrl?: string; contentType?: string };
            diagnostic.images.push({ url: item.url, accepted: false, reason: code,
              ...(detail.status !== undefined ? { status: detail.status, finalUrl: detail.finalUrl, contentType: detail.contentType } : {}) });
          }
        }));
      }
    } catch { diagnostic.error = 'press_page_fetch_rejected'; }
  }
  return { policyVersion: PRESS_POLICY, candidates, diagnostics, pagesAttempted: urls.slice(0, 4).length,
    pagesRead: diagnostics.filter(d => d.pageRead).length, usableImagesFound: candidates.length,
    outcome: candidates.length ? 'verified_candidates_require_visual_selection' : 'no_usable_images',
    rightsInstruction: 'Kredit er kildebelæg, ikke licens. usageTerms er kun eksplicit fundne vilkår; tom liste betyder ukendt.' };
}
