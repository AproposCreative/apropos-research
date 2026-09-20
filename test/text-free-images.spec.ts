import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const f = vi.hoisted(() => ({ rows: new Map<string, any>(), files: new Map<string, any>(), chat: vi.fn(), edit: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => {
  const doc = (path: string): any => ({
    path, get: async () => ({ data: () => f.rows.get(path) }),
    set: async (data: any, opts?: any) => { f.rows.set(path, opts?.merge ? { ...f.rows.get(path), ...data } : data); },
    create: async (data: any) => { if (f.rows.has(path)) throw { code: 6 }; f.rows.set(path, data); },
    collection: (name: string) => ({ doc: (id: string) => doc(`${path}/${name}/${id}`) }),
  });
  return {
    getAdminDb: () => ({ collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
      runTransaction: async (fn: any) => fn({ get: (ref: any) => ref.get(), set: (ref: any, data: any, opts: any) => ref.set(data, opts) }) }),
    getAdminStorageBucket: () => ({ file: (path: string) => ({
      save: async (bytes: Buffer, options: any) => { if (f.files.has(path)) throw { code: 412 }; f.files.set(path, { bytes, metadata: options.metadata }); },
      download: async () => [f.files.get(path).bytes], getMetadata: async () => [f.files.get(path).metadata],
    }) }),
  };
});
vi.mock('@/lib/openai', () => ({ getImageGenOpenAIClient: () => ({ chat: { completions: { create: f.chat } }, images: { edit: f.edit } }) }));
import { ensureTextFreeImage, getTextFreeReceipt } from '@/lib/images/text-free';
import { textFreeCanvas, textFreeVerdict } from '@/lib/images/text-free-policy';
let original: Buffer;
const answer = (hasText: boolean, preserved = true) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ hasText, preserved }) } }] });
beforeEach(async () => {
  vi.clearAllMocks(); f.rows.clear(); f.files.clear();
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test-bucket';
  original = await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#aa0011' } }).jpeg().toBuffer();
  const output = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: '#aa0011' } }).webp().toBuffer();
  f.edit.mockResolvedValue({ data: [{ b64_json: output.toString('base64') }] });
  f.chat.mockResolvedValue(answer(false));
});
it('does not buy an edit for a clean image and reuses inspection on reopening', async () => {
  const result = await ensureTextFreeImage(original);
  expect(result.bytes.equals(original)).toBe(true); expect(result.receipt.edited).toBe(false);
  await ensureTextFreeImage(original);
  expect(f.chat).toHaveBeenCalledOnce(); expect(f.edit).not.toHaveBeenCalled();
});
it('edits once, preserves original, removes padding, and caches the clean derivative', async () => {
  f.chat.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false));
  const result = await ensureTextFreeImage(original);
  expect(result.receipt.edited).toBe(true); expect(result.receipt.image).toMatchObject({ width: 1536, height: 864 });
  expect(f.files.get(result.receipt.original.storagePath).bytes.equals(original)).toBe(true);
  await ensureTextFreeImage(original); await ensureTextFreeImage(result.bytes);
  expect(f.edit).toHaveBeenCalledOnce(); expect(f.chat).toHaveBeenCalledTimes(2);
  expect((await getTextFreeReceipt(result.receipt.id)).image.contentHash).toBe(result.receipt.image.contentHash);
});
it('fails closed on changed identity and does not regenerate on retry', async () => {
  f.chat.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false, false));
  await expect(ensureTextFreeImage(original)).rejects.toThrow('review_failed');
  await expect(ensureTextFreeImage(original)).rejects.toThrow('review_failed');
  expect(f.edit).toHaveBeenCalledOnce(); expect(f.chat).toHaveBeenCalledTimes(2);
});
it('blocks remaining lettering with no automatic image regeneration', async () => {
  f.chat.mockResolvedValue(answer(true));
  await expect(ensureTextFreeImage(original)).rejects.toThrow('still_present');
  await expect(ensureTextFreeImage(original)).rejects.toThrow('still_present');
  expect(f.edit).toHaveBeenCalledOnce();
});
it('does not purchase again after an ambiguous provider timeout', async () => {
  f.chat.mockResolvedValue(answer(true)); f.edit.mockRejectedValue(new Error('timeout'));
  await expect(ensureTextFreeImage(original)).rejects.toThrow('timeout');
  await expect(ensureTextFreeImage(original)).rejects.toThrow('outcome_unknown');
  expect(f.edit).toHaveBeenCalledOnce();
});
it('rejects a simultaneous second worker', async () => {
  let release!: (value: any) => void;
  f.chat.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const first = ensureTextFreeImage(original);
  await vi.waitFor(() => expect(f.chat).toHaveBeenCalledOnce());
  await expect(ensureTextFreeImage(original)).rejects.toThrow('in_progress');
  release(answer(false)); await first; expect(f.chat).toHaveBeenCalledOnce();
});
it('validates strict verdicts and computes 16:9 and portrait padding without stretching', () => {
  expect(textFreeCanvas(1280, 720)).toEqual({ width: 1536, height: 864, left: 0, top: 80 });
  expect(textFreeCanvas(600, 900)).toEqual({ width: 683, height: 1024, left: 426, top: 0 });
  expect(() => textFreeVerdict({ hasText: 'false' }, false)).toThrow();
  expect(() => textFreeVerdict({ hasText: false }, true)).toThrow();
});
