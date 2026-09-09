import { describe, expect, it, afterEach, vi } from 'vitest';
import sharp from 'sharp';
import { encodeWebp } from '../lib/images/encode-webp';
import { downloadImage, imageMeetsPolicy, inspectImageBatch } from '../lib/images/inspect-image';

const policy = { maxSizeKB: 50, maxLongEdge: 1200, qualityStart: 85, qualityMin: 65, effort: 1 };
async function sample(width=1800, height=1000) { return sharp({create:{width,height,channels:3,background:'#d04973'}}).png().toBuffer(); }
afterEach(() => vi.unstubAllGlobals());
describe('measured image budgets', () => {
  it('uses actual width and height, does not upscale and meets the exact byte budget', async () => {
    const result = await encodeWebp(await sample(), policy);
    expect(result.width).toBe(1200); expect(result.height).toBe(667);
    expect(result.bytes).toBe(result.data.byteLength); expect(result.bytes).toBeLessThanOrEqual(50*1024);
    const small = await encodeWebp(await sample(400,300),policy); expect(small.width).toBe(400);
  });
  it('rejects impossible budgets rather than uploading an oversized fixed canvas', async () => {
    await expect(encodeWebp(await sample(),{...policy,maxSizeKB:0.01,preserveDimensions:true})).rejects.toThrow('exceeds');
  });
  it('rejects impossible resize budgets at a bounded resolution floor', async () => {
    await expect(encodeWebp(await sample(),{...policy,maxSizeKB:0.01})).rejects.toThrow('minimum permitted');
  });
  it('honors exact editorial canvas and reports rotated output dimensions', async () => {
    const input=await sharp(await sample(800,400)).jpeg().withMetadata({orientation:6}).toBuffer();
    const result=await encodeWebp(input,{...policy,preserveDimensions:true});
    expect([result.width,result.height]).toEqual([400,800]);
    const exact=await encodeWebp(input,{...policy,targetDimensions:{width:300,height:200}});
    expect([exact.width,exact.height]).toEqual([300,200]);
  });
  it('checks real dimensions even when a file is small and claims to be optimized', async () => {
    const big=await sharp(await sample(2400,1600)).webp().toBuffer();
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(big))));
    expect(await imageMeetsPolicy('https://example.test/mobile-1200w-optimized.webp',260,1200)).toBe(false);
    expect(await imageMeetsPolicy('https://example.test/arbitrary.webp',450,2400)).toBe(true);
  });
  it('treats unavailable images as verification failures', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
    await expect(imageMeetsPolicy('https://example.test/optimized.webp',450,2400)).rejects.toThrow('503');
  });
  it('limits actual downloaded bytes even without Content-Length', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(25*1024*1024))));
    await expect(downloadImage('https://example.test/large.webp')).rejects.toThrow('24 MB');
  });
  it('limits inspections to ten and returns a stable continuation without writes', async () => {
    const inspected:number[]=[]; const page=await inspectImageBatch(Array.from({length:23},(_,i)=>i),10,async i=>{inspected.push(i);return i;});
    expect(page.candidates).toEqual(Array.from({length:10},(_,i)=>i+10)); expect(page.nextOffset).toBe(20);expect(inspected).toHaveLength(10);
    expect((await inspectImageBatch([1,2],0,async i=>i)).nextOffset).toBeNull();
  });
});
