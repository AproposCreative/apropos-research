import sharp from 'sharp';

const MAX_BYTES = 24 * 1024 * 1024;
/** Bounded read shared by verification and processing; unknown data never means compliant. */
export async function downloadImage(url: string, timeoutMs = 10000): Promise<Buffer> {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid image URL');
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok || !response.body) throw new Error(`Image fetch failed (${response.status})`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) throw new Error('Image exceeds 24 MB processing limit');
      chunks.push(chunk.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function imageMeetsPolicy(url: string, maxSizeKB: number, maxLongEdge: number): Promise<boolean> {
  if (![maxSizeKB, maxLongEdge].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid image policy');
  const input = await downloadImage(url);
  const meta = await sharp(input, { limitInputPixels: 80_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error('Image dimensions unavailable');
  return meta.format === 'webp' && (meta.pages ?? 1) === 1 && input.byteLength <= maxSizeKB * 1024 && Math.max(meta.width, meta.height) <= maxLongEdge;
}

/** At most 10 inspections per request; three concurrent downloads, stable pagination. */
export async function inspectImageBatch<T, R>(items: T[], offset: number | undefined, inspect: (item: T) => Promise<R>) {
  const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset!)) : 0;
  const page = items.slice(start, start + 10);
  const results = new Array<R>(page.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < page.length) { const index = cursor++; results[index] = await inspect(page[index]); }
  }));
  return { candidates: results, offset: start, checked: page.length, nextOffset: start + page.length < items.length ? start + page.length : null };
}
