import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { quoteImageGenEdit } from '@/lib/image-gen/edit-pricing';
import { LivBudgetOpenAI } from '@/lib/liv/cost-openai';
import { withLivCostContext } from '@/lib/liv/cost-context';
import type { LivCostLedger } from '@/lib/liv/cost-ledger';
const file = () => new File([new Uint8Array([1, 2, 3])], 'reference.webp', { type: 'image/webp' });
function form() {
  const data = new FormData();
  Object.entries({ model: 'gpt-image-1.5', prompt: 'One simple editorial illustration', n: '1',
    size: '1536x1024', quality: 'high', output_format: 'webp' }).forEach(([key, value]) => data.set(key, value));
  data.append('image[]', file()); return data;
}
describe('bounded image edits', () => {
  it('quotes one and two uploaded references, hashing their actual bytes', async () => {
    const data = form(), first = await quoteImageGenEdit(data);
    data.append('image[]', file()); const second = await quoteImageGenEdit(data);
    expect(second.quote.reservedUsdMicros - first.quote.reservedUsdMicros).toBe(32768 * 8);
    expect(second.requestHash).not.toBe(first.requestHash);
    expect((await quoteImageGenEdit(data)).requestHash).toBe(second.requestHash);
  });
  it.each(['url', 'extra', 'duplicate', 'too-many', 'large', 'empty', 'model'])('rejects %s before transport', async kind => {
    const data = form();
    if (kind === 'url') data.set('image[]', 'https://example.com/image.png');
    if (kind === 'extra') data.set('unknown', '1');
    if (kind === 'duplicate') data.append('n', '1');
    if (kind === 'too-many') { data.append('image[]', file()); data.append('image[]', file()); }
    if (kind === 'large') data.set('image[]', new File([new Uint8Array(2_000_001)], 'x.webp', { type: 'image/webp' }));
    if (kind === 'empty') data.delete('image[]');
    if (kind === 'model') data.set('model', 'unpriced');
    await expect(quoteImageGenEdit(data)).rejects.toThrow();
  });
  it('accepts the actual SDK multipart request and reserves once before transport', async () => {
    const reserve = vi.fn().mockResolvedValue({}), complete = vi.fn().mockResolvedValue(undefined);
    const transport = vi.fn(async () => {
      expect(reserve).toHaveBeenCalledOnce();
      return Response.json({ data: [{ b64_json: 'AQID' }], usage: { input_tokens: 100, output_tokens: 100 } });
    });
    const sdk = new LivBudgetOpenAI({ apiKey: 'fixture-not-a-key', fetch: transport }, { reserve, complete } as LivCostLedger);
    const call = () => sdk.images.edit({ model: 'gpt-image-1.5', image: [file()], prompt: 'Simple illustration', n: 1,
      size: '1536x1024', quality: 'high', output_format: 'webp' }, { maxRetries: 4 });
    await withLivCostContext({ scope: 'image-gen', runId: 'fixture', stage: 'edit' }, call);
    expect(transport).toHaveBeenCalledOnce(); expect(complete).toHaveBeenCalledOnce();
    expect(reserve.mock.calls[0][0].context.scope).toBe('image-gen');
    await expect(withLivCostContext({ runId: 'liv-fixture', stage: 'edit' }, call)).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
  });
});
