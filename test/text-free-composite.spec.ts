import { expect, it } from 'vitest';
import sharp from 'sharp';
import { compositeTextRemoval } from '@/lib/images/text-free-composite';
import { textFreeRegions } from '@/lib/images/text-free-policy';
it('keeps original pixels outside lettering masks, even if AI completely redraws the subject', async () => {
  const original = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const edited = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#0000ff' } }).png().toBuffer();
  const result = await compositeTextRemoval(original, edited, [{ x: 700, y: 200, width: 200, height: 600 }]);
  const pixel = (left: number, top: number) => sharp(result).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  expect([...await pixel(100, 150)]).toEqual([255, 0, 0]);
  // Global blue drift in the AI response is matched back to the red source.
  expect([...await pixel(320, 150)]).toEqual([255, 0, 0]);
});
it('bounds reconstruction memory for high-resolution press photos without changing their aspect ratio',async()=>{
  const original=await sharp({create:{width:8192,height:5464,channels:3,background:'#ff0000'}}).jpeg().toBuffer();
  const edited=await sharp({create:{width:1536,height:1024,channels:3,background:'#ff0000'}}).jpeg().toBuffer();
  const result=await compositeTextRemoval(original,edited,[{x:700,y:200,width:10,height:10}]);
  const meta=await sharp(result).metadata();
  expect(meta.width).toBe(3840);expect(meta.height).toBe(2561);
  expect([...await sharp(result).extract({left:100,top:100,width:1,height:1}).removeAlpha().raw().toBuffer()]).toEqual([254,0,0]);
});
it.each([[], [{ x: 0, y: 0, width: 1000, height: 1000 }], [{ x: -1, y: 0, width: 20, height: 20 }]])('rejects missing or unsafe region masks', regions => {
  expect(() => textFreeRegions(regions)).toThrow();
});
it('removes a bright letter-shaped mark while matching a differently coloured reconstruction to its boundary', async () => {
  const original = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ff0000' } })
    .composite([{ input: await sharp({ create: { width: 12, height: 50, channels: 3, background: '#ffffff' } }).png().toBuffer(), left: 300, top: 100 }]).png().toBuffer();
  const edited = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#0000ff' } }).png().toBuffer();
  const result = await compositeTextRemoval(original, edited, [{ x: 700, y: 200, width: 200, height: 600 }]);
  const pixel = await sharp(result).extract({ left: 305, top: 120, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  expect([...pixel]).toEqual([255, 0, 0]);
});
