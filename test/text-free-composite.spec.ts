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
  expect([...await pixel(320, 150)]).toEqual([0, 0, 255]);
});
it.each([[], [{ x: 0, y: 0, width: 1000, height: 1000 }], [{ x: -1, y: 0, width: 20, height: 20 }]])('rejects missing or unsafe region masks', regions => {
  expect(() => textFreeRegions(regions)).toThrow();
});
