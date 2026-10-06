import sharp from 'sharp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readPublicMedia } from '@/lib/liv/public-media-reader';

/** Render the saved image, not the expiring ChatGPT input. A thumbnail failure
 * must never turn a committed import into an error/repeated CMS allocation. */
export async function importedImageResult(raw: unknown): Promise<CallToolResult> {
  const receipt = raw as { assetId: string; url: string; revision: number; replay: boolean; paidAiCalls: number };
  let thumbnail: Buffer | undefined;
  try {
    thumbnail = await sharp(await readPublicMedia(receipt.url, 'image', 5000), { limitInputPixels: 80_000_000 })
      .rotate().resize({ width: 960, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  } catch { /* The durable receipt remains authoritative. */ }
  return { content: [
    { type: 'text', text: JSON.stringify({ ...receipt, importStatus: 'attached',
      imagePreview: thumbnail ? 'included' : 'unavailable',
      nextAction: 'Vis det gemte billede for brugeren og kald preview_submission med samme submissionId for hele artiklen. Importen er gemt; køb eller importér ikke billedet igen ved manglende visning.' }) },
    ...(thumbnail ? [{ type: 'image' as const, data: thumbnail.toString('base64'), mimeType: 'image/webp' }] : []),
  ] };
}
