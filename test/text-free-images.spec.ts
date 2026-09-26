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
const answer = (hasText: boolean, preserved = true) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ hasText, preserved,
  reason: hasText ? 'Distinct lettering is visible in the indicated rectangular area.' : 'The visible strokes are material texture rather than letters or recognizable brand marks.',
  regions: hasText ? [{ x: 550, y: 150, width: 400, height: 430 }] : [] }) } }] });
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
  f.chat.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false));
  const result = await ensureTextFreeImage(original);
  expect(result.receipt.edited).toBe(true); expect(result.receipt.image).toMatchObject({ width: 1280, height: 720 });
  expect(f.files.get(result.receipt.original.storagePath).bytes.equals(original)).toBe(true);
  await ensureTextFreeImage(original); await ensureTextFreeImage(result.bytes);
  expect(f.edit).toHaveBeenCalledOnce(); expect(f.chat).toHaveBeenCalledTimes(3);
  expect((await getTextFreeReceipt(result.receipt.id)).image.contentHash).toBe(result.receipt.image.contentHash);
});
it('fails closed on changed identity and does not regenerate on retry', async () => {
  f.chat.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false, false));
  await expect(ensureTextFreeImage(original)).rejects.toThrow('review_failed');
  await expect(ensureTextFreeImage(original)).rejects.toThrow('review_failed');
  expect(f.edit).toHaveBeenCalledOnce(); expect(f.chat).toHaveBeenCalledTimes(3);
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
it('confirms a false positive once and preserves original pixels without purchasing an edit', async () => {
  f.chat.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false));
  const r=await ensureTextFreeImage(original);
  expect(r.bytes.equals(original)).toBe(true);expect(r.receipt.edited).toBe(false);
  expect(f.chat.mock.calls[1][0]).toMatchObject({model:'gpt-5.6-sol',max_completion_tokens:1000});
  await ensureTextFreeImage(original);expect(f.chat).toHaveBeenCalledTimes(2);expect(f.edit).not.toHaveBeenCalled();
});
it('can recover a clean original while retaining a legacy rejected edit and its failed comparison', async () => {
  f.chat.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false,false));
  await expect(ensureTextFreeImage(original)).rejects.toThrow('review_failed');
  const confirmation=[...f.rows.keys()].find(k=>k.endsWith('/confirm-lettering'))!;
  f.rows.delete(confirmation); // legacy fixture predates expert confirmation
  const rejected=[...f.rows.entries()].find(([k])=>k.endsWith('/verify-blended'))!;
  const snapshot=structuredClone(rejected[1]);
  f.chat.mockResolvedValue(answer(false));
  const r=await ensureTextFreeImage(original);
  expect(r.bytes.equals(original)).toBe(true);expect(r.receipt.edited).toBe(false);
  expect(f.rows.get(rejected[0])).toEqual(snapshot);expect(f.edit).toHaveBeenCalledOnce();
  await ensureTextFreeImage(original);expect(f.chat).toHaveBeenCalledTimes(4);
});
it('reviews changed composite pixels once without replacing the rejected legacy verdict or rebuying the edit', async () => {
  f.chat.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false,false));
  await expect(ensureTextFreeImage(original)).rejects.toThrow('review_failed');
  const confirmation=[...f.rows.keys()].find(k=>k.endsWith('/confirm-lettering'))!;
  f.rows.delete(confirmation);
  const rejected=[...f.rows.entries()].find(([k])=>k.endsWith('/verify-blended'))!;
  const snapshot=structuredClone(rejected[1]);
  const expert=answer(true);
  const value=JSON.parse(expert.choices[0].message.content);
  value.regions=[{x:700,y:750,width:35,height:25}];
  expert.choices[0].message.content=JSON.stringify(value);
  f.chat.mockResolvedValueOnce(expert).mockResolvedValueOnce(answer(false));
  const result=await ensureTextFreeImage(original);
  expect(result.receipt.edited).toBe(true);
  const bound=[...f.rows.entries()].find(([k])=>k.endsWith('/verify-confirmed-blend'))![1];
  expect(bound.inputHash).toBe(result.receipt.image.contentHash);
  expect(f.rows.get(rejected[0])).toEqual(snapshot);
  await ensureTextFreeImage(original);
  expect(f.edit).toHaveBeenCalledOnce();expect(f.chat).toHaveBeenCalledTimes(5);
});
it('never repeats an ambiguous corrected-composite review', async () => {
  const expert=answer(true), value=JSON.parse(expert.choices[0].message.content);
  value.regions=[{x:700,y:750,width:35,height:25}];expert.choices[0].message.content=JSON.stringify(value);
  f.chat.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(expert).mockRejectedValueOnce(Error('timeout'));
  await expect(ensureTextFreeImage(original)).rejects.toThrow('timeout');
  await expect(ensureTextFreeImage(original)).rejects.toThrow('outcome_unknown');
  expect(f.edit).toHaveBeenCalledOnce();expect(f.chat).toHaveBeenCalledTimes(3);
});
it.each(['missing-reason','regions-without-text','uncertain-timeout'])('does not approve or re-buy invalid expert confirmation: %s',async kind=>{
  f.chat.mockResolvedValueOnce(answer(true));
  if(kind==='uncertain-timeout')f.chat.mockRejectedValueOnce(Error('timeout'));
  else f.chat.mockResolvedValueOnce({choices:[{finish_reason:'stop',message:{content:JSON.stringify({hasText:false,
    reason:kind==='missing-reason'?'': 'A specific visual explanation of the inspected original image is provided.',
    regions:kind==='regions-without-text'?[{x:0,y:0,width:1,height:1}]:[]})}}]});
  await expect(ensureTextFreeImage(original)).rejects.toThrow();
  await expect(ensureTextFreeImage(original)).rejects.toThrow();
  expect(f.chat).toHaveBeenCalledTimes(2);expect(f.edit).not.toHaveBeenCalled();
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
