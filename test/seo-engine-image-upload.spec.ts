import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const storage=vi.hoisted(()=>({file:vi.fn(),save:vi.fn()}));
vi.mock('../lib/config/env',()=>({env:{NEXT_PUBLIC_FIREBASE_PROJECT_ID:'test-project'}}));
vi.mock('../lib/firebase-admin',()=>({getAdminStorageBucket:()=>({file:storage.file})}));
import { optimizeAndUploadImage } from '../lib/images/optimize-and-upload';
beforeEach(()=>{vi.clearAllMocks();storage.file.mockReturnValue({save:storage.save});storage.save.mockResolvedValue(undefined);});
describe('verified image uploads',()=>{
 it('uploads measured outputs under distinct keys, preserving earlier download URLs on force/retry',async()=>{
  const input=await sharp({create:{width:400,height:300,channels:3,background:'#ca4837'}}).png().toBuffer();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(input))));
  const options={imageUrl:'https://images.test/original.png',maxLongEdge:2400,maxSizeKB:450,role:'thumb',effort:1};
  const a=await optimizeAndUploadImage(options);const b=await optimizeAndUploadImage(options);
  expect(a.width).toBe(400);expect(a.fileName).toContain('-400w-');expect(a.fileName).not.toBe(b.fileName);
  expect(storage.file).toHaveBeenCalledTimes(2);
  for(const [buffer] of storage.save.mock.calls)expect(buffer.byteLength).toBeLessThanOrEqual(450*1024);
 });
 it('does not upload when a fixed canvas cannot meet the byte budget',async()=>{
  let value=42;const raw=Buffer.alloc(900*900*3);for(let i=0;i<raw.length;i++){value=(Math.imul(value,1664525)+1013904223)>>>0;raw[i]=value>>>24;}
  const input=await sharp(raw,{raw:{width:900,height:900,channels:3}}).png().toBuffer();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(input))));
  await expect(optimizeAndUploadImage({imageUrl:'https://images.test/noise.png',maxSizeKB:20,preserveDimensions:true,qualityMin:72,qualityStart:72,effort:1})).rejects.toThrow('exceeds');
  expect(storage.save).not.toHaveBeenCalled();
 });
});
