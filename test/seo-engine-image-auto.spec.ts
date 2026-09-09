import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks=vi.hoisted(()=>({optimize:vi.fn()}));
vi.mock('../lib/images/optimize-and-upload',()=>({optimizeAndUploadImage:mocks.optimize}));
vi.mock('../lib/firebase-admin',()=>({getAdminDb:()=>null}));
vi.mock('../lib/webflow-config',()=>({getWebflowConfig:()=>({apiToken:'test-only',siteId:'site',articlesCollectionId:'articles'})}));
vi.mock('../lib/config/env',()=>({env:{}}));
import { maybeOptimizeThumbImageForFieldData, previewThumbImageOptimization, runThumbImageOptimization } from '../lib/webflow/thumb-image-optimizer';
import { maybeOptimizeMobileImageForFieldData } from '../lib/webflow/mobile-image-optimizer';
const schema={fields:[{slug:'thumb'},{slug:'mobile-image'}]};
let image:Buffer;
beforeEach(async()=>{
 vi.clearAllMocks();
 image=await sharp({create:{width:3000,height:2000,channels:3,background:'#344055'}}).webp().toBuffer();
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/collections/articles') && !url.includes('/items') ? new Response(JSON.stringify(schema)) : new Response(new Uint8Array(image))));
 mocks.optimize.mockResolvedValue({url:'https://images.test/verified.webp',width:2400,height:1600,processedSizeKB:100,originalSizeKB:200,quality:80});
});
describe('automatic mobile and desktop optimization',()=>{
 it('remeasures an optimized-looking desktop URL and preserves editorial alt',async()=>{
  const fields:Record<string,unknown>={thumb:{url:'https://images.test/webflow%252Fthumb-images%252Fold-2400w.webp',alt:'Band på scenen'},content:'Editorial text'};
  expect(await maybeOptimizeThumbImageForFieldData({fieldData:fields})).toBe(true);
  expect(mocks.optimize).toHaveBeenCalledWith(expect.objectContaining({maxSizeKB:450,maxLongEdge:2400,preserveDimensions:false}));
  expect(fields.thumb).toEqual({url:'https://images.test/verified.webp',alt:'Band på scenen'});expect(fields.content).toBe('Editorial text');
 });
 it('does not recompress a genuinely compliant image regardless of filename',async()=>{
  image=await sharp(image).resize(1000).webp().toBuffer();
  const fields={thumb:'https://images.test/editorial.webp'};
  expect(await maybeOptimizeThumbImageForFieldData({fieldData:fields})).toBe(false);expect(mocks.optimize).not.toHaveBeenCalled();
 });
 it('remeasures mobile output and preserves a deliberate empty alt',async()=>{
  const fields:Record<string,unknown>={thumb:'https://images.test/desktop.webp','mobile-image':{url:'https://images.test/webflow/mobile-images/old.webp',alt:''}};
  await maybeOptimizeMobileImageForFieldData({fieldData:fields});
  expect(mocks.optimize).toHaveBeenCalledWith(expect.objectContaining({maxSizeKB:260,maxLongEdge:1200,imageUrl:'https://images.test/webflow/mobile-images/old.webp'}));
  expect(fields['mobile-image']).toEqual({url:'https://images.test/verified.webp',alt:''});
 });
 it('propagates encoding failure without replacing the source',async()=>{
  mocks.optimize.mockRejectedValue(new Error('Image exceeds budget'));
  const fields={thumb:'https://images.test/original.webp'};
  await expect(maybeOptimizeThumbImageForFieldData({fieldData:fields})).rejects.toThrow('exceeds budget');
  expect(fields.thumb).toBe('https://images.test/original.webp');
 });
 it('reports measurement errors in preview rather than reporting already optimized',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
   if(url.includes('/items'))return new Response(JSON.stringify({items:[{id:'one',fieldData:{name:'One',thumb:'https://images.test/unavailable.webp'}}]}));
   if(url.includes('/collections/articles'))return new Response(JSON.stringify(schema));
   return new Response('',{status:503});
  }));
  const preview=await previewThumbImageOptimization();
  expect(preview.ready).toBe(0);expect(preview.existing).toBe(0);expect(preview.candidates[0].status).toBe('check-failed');
  expect(preview.checked).toBe(1);expect(preview.nextOffset).toBeNull();expect(mocks.optimize).not.toHaveBeenCalled();
 });
});

it('refuses a stale desktop replacement before touching editorial fields', async () => {
 const source='https://images.test/source.webp';
 const fetchMock=vi.fn(async(url:string, init?:RequestInit)=>{
  if(init?.method==='PATCH') throw new Error('Unexpected write');
  if(url.endsWith('/items/one')) return new Response(JSON.stringify({fieldData:{thumb:'https://images.test/editor-new.webp',content:'Liv draft'}}));
  if(url.includes('/items?')) return new Response(JSON.stringify({items:[{id:'one',fieldData:{name:'One',thumb:source}}]}));
  if(url.includes('/collections/articles')) return new Response(JSON.stringify(schema));
  return new Response(new Uint8Array(image));
 });
 vi.stubGlobal('fetch',fetchMock);
 const result=await runThumbImageOptimization({force:true});
 expect(result.failed).toBe(1); expect(result.results[0].error).toContain('changed during optimization');
 expect(fetchMock.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false);
});
