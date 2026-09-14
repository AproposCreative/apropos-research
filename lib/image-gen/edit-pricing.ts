import { LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE, LIV_PRICE_VERSION, type LivPriceQuote } from '@/lib/liv/cost-pricing';
import { createHash } from 'node:crypto';

/** Image-gen only: bounded uploaded references, never arbitrary provider URLs.
 * GPT Image 1.5 image input $8/M and output $32/M (official model page).
 * Reference allowance is an operational hold, not a provider-enforced token cap.
 * Actual usage settles the hold; a breach blocks the ledger like Liv does.
 */
export async function quoteImageGenEdit(form: FormData): Promise<{ quote: LivPriceQuote; requestHash: string }> {
  const fields: Record<string, string> = {}, hashes: string[] = [];
  for (const [key, value] of form.entries()) {
    if (key === 'image' || key === 'image[]') {
      if (typeof value === 'string' || !['image/png', 'image/jpeg', 'image/webp'].includes(value.type) ||
          value.size < 1 || value.size > 2_000_000 || hashes.length >= 2) throw new Error('liv_cost_image_unbounded');
      hashes.push(createHash('sha256').update(Buffer.from(await value.arrayBuffer())).digest('hex'));
    } else {
      if (typeof value !== 'string' || Object.hasOwn(fields, key) ||
          !['model', 'prompt', 'n', 'size', 'quality', 'output_format'].includes(key)) throw new Error('liv_cost_image_unbounded');
      fields[key] = value;
    }
  }
  if (!hashes.length || fields.model !== 'gpt-image-1.5' || fields.n !== '1' || fields.size !== '1536x1024' ||
      fields.quality !== 'high' || fields.output_format !== 'webp' || !fields.prompt?.trim() ||
      Buffer.byteLength(fields.prompt) > 12_000) throw new Error('liv_cost_image_unbounded');
  const input = Buffer.byteLength(fields.prompt) + 1024 + hashes.length * 32768;
  return { requestHash: createHash('sha256').update(JSON.stringify([fields, hashes])).digest('hex'),
    quote: { model: fields.model, endpoint: '/images/edits', version: LIV_PRICE_VERSION,
      source: 'https://developers.openai.com/api/docs/models/gpt-image-1.5', kind: 'image',
      inputTokenBound: input, outputTokenBound: LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE, toolCallBound: 0,
      inputUsdPerMillion: 8, outputUsdPerMillion: 32, fixedUsdBound: 0,
      reservedUsdMicros: input * 8 + LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE * 32 } };
}
