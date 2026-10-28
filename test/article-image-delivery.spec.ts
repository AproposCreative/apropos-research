import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const state = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@/lib/images/optimize-and-upload', () => ({ optimizeAndUploadImage: state.upload }));
vi.mock('@/lib/webflow-mapping', () => ({ readMapping: () => ({ entries: [] }) }));
import { optimizeContentHtmlInline, maybeOptimizeContentImagesForFieldData } from '@/lib/webflow/content-image-optimizer';
import { verifyArticleImageDelivery } from '@/lib/webflow/image-delivery-policy';
import { encodeWebp } from '@/lib/images/encode-webp';
let large: Buffer, small: Buffer;
beforeEach(async () => {
  vi.clearAllMocks();
  large = await sharp({create:{width:3900,height:2600,channels:3,background:'#343434'}}).jpeg().toBuffer();
  small = await sharp(large).resize(1200).webp().toBuffer();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(new Uint8Array(url.includes('good') ? small : large))));
  state.upload.mockImplementation(async ({imageUrl}) => ({url:`${imageUrl}?good`,width:1200,height:800}));
});
it('inspects all images including the ninth, small bytes, old optimized names and repeated sources', async () => {
  const sources=Array.from({length:13},(_,i)=>`https://cdn.test/webflow/content-images/${i}.webp`);
  const html='<p>Uændret anmeldelse</p>'+[...sources,sources[0]].map(src=>`<figure><img alt="Fotografi" src="${src}"><figcaption>Foto: Fotograf</figcaption></figure>`).join('');
  const result=await optimizeContentHtmlInline(html,{minOriginalKB:999999,imagesPerArticle:1});
  expect(result.imagesOptimized).toBe(13);expect(result.imagesFailed).toBe(0);
  expect(state.upload).toHaveBeenCalledTimes(13);
  expect(result.html).toContain('<p>Uændret anmeldelse</p>');
  expect(result.html.match(/<figcaption>Foto: Fotograf<\/figcaption>/g)).toHaveLength(14);
  expect(result.html.match(/\?good/g)).toHaveLength(14);
});
it('keeps compliant files, but reports download failure rather than treating it as optimized', async () => {
  const good='<img src="https://cdn.test/good.webp" alt="Billede">';
  expect(await optimizeContentHtmlInline(good)).toMatchObject({changed:false,imagesOptimized:0,imagesFailed:0});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
  expect(await optimizeContentHtmlInline(good)).toMatchObject({changed:false,imagesFailed:1});
  expect(state.upload).not.toHaveBeenCalled();
});
it('processes both CMS rich-text fields and rejects false compliance', async () => {
  const fields={content:'<img src="https://cdn.test/a.jpg">','post-body':'<img src="https://cdn.test/b.jpg">'};
  expect(await maybeOptimizeContentImagesForFieldData({fieldData:fields})).toEqual({imagesOptimized:2,imagesFailed:0});
  expect(await verifyArticleImageDelivery(fields)).toMatchObject({verifiedImages:2});
  await expect(verifyArticleImageDelivery({thumb:'https://cdn.test/a.jpg'})).rejects.toThrow('missing_mobile');
  await expect(verifyArticleImageDelivery({content:'<img src="https://cdn.test/fake-good-name.jpg">'})).resolves.toMatchObject({verifiedImages:1});
  await expect(verifyArticleImageDelivery({content:'<img src="https://cdn.test/oversize.webp">'})).rejects.toThrow('noncompliant:content');
});
it('derivatives preserve the full frame and originals, and meet each role budget', async () => {
  const original=Buffer.from(large);
  for(const [maxSizeKB,maxLongEdge] of [[450,2400],[260,1200],[200,1200]]){
    const output=await encodeWebp(large,{maxSizeKB,maxLongEdge,qualityStart:85,qualityMin:65});
    expect(output.bytes).toBeLessThanOrEqual(maxSizeKB*1024);
    expect(Math.max(output.width,output.height)).toBeLessThanOrEqual(maxLongEdge);
    expect(output.width/output.height).toBeCloseTo(1.5,2);
    expect((await sharp(output.data).metadata()).format).toBe('webp');
  }
  expect(large.equals(original)).toBe(true);
});
