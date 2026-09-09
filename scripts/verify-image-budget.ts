/** Public source images, pure in-memory encoder, no uploads or CMS calls. */
import { readFile, writeFile } from 'node:fs/promises';
import { downloadImage } from '../lib/images/inspect-image';
import { encodeWebp } from '../lib/images/encode-webp';
const directory = new URL('../docs/audits/2026-09-09-morningscore/', import.meta.url);
const inventory = JSON.parse(await readFile(new URL('image-sizes.json', directory), 'utf8'));
const results = [];
for (const term of ['turboweekend-tinderbox','ericka-jane-syd-for-solen','kurt-vile-the-violators']) {
  const image = inventory.images.find((i: {url:string}) => i.url.includes(term) && i.url.includes('thumb-'));
  if (!image) throw new Error('Missing verified source');
  const source = await downloadImage(image.url);
  for (const [role, policy] of Object.entries({ desktop: {maxSizeKB:450,maxLongEdge:2400,qualityStart:88,qualityMin:72}, mobile: {maxSizeKB:260,maxLongEdge:1200,qualityStart:85,qualityMin:65} })) {
    const start = Date.now();
    const output = await encodeWebp(source, {...policy,effort:4});
    results.push({source:image.url,role,originalBytes:source.byteLength,outputBytes:output.bytes,width:output.width,height:output.height,quality:output.quality,milliseconds:Date.now()-start,savedPercent:Math.round((1-output.bytes/source.byteLength)*100)});
  }
}
await writeFile(new URL('encoder-verification.json',directory),JSON.stringify({generatedAt:new Date().toISOString(),mode:'In-memory only, no output files or upload',results},null,2)+'\n');
console.log(JSON.stringify(results.map(({source,...row})=>({file:source.split('/').at(-1),...row})),null,2));
