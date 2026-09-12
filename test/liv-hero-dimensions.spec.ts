import { expect, it } from 'vitest';
import { chooseLivHeroDimensions, isLivHeroDimensions } from '@/lib/liv/hero-dimensions';

it.each([[1920, 1080, 1920, 1080], [3840, 1920, 1920, 1080], [1200, 675, 1200, 675],
  [1200, 800, 1200, 675], [1919, 1080, 1200, 675], [1920, 1079, 1200, 675]])('chooses the largest fitting native output for %i x %i', (width, height, w, h) => {
  expect(chooseLivHeroDimensions(width, height)).toEqual({ width: w, height: h });
});
it.each([[1199, 675], [1200, 674], [NaN, 1080], [Infinity, 1080], [1200.5, 675]])('rejects undersized or invalid sources %i x %i', (width, height) => {
  expect(chooseLivHeroDimensions(width, height)).toBeNull();
});
it('uses EXIF-oriented bounds and accepts only exact output pairs', () => {
  expect(chooseLivHeroDimensions(675, 1200, 6)).toEqual({ width: 1200, height: 675 });
  expect(chooseLivHeroDimensions(1200, 675, 6)).toBeNull();
  for (const [width, height] of [[1200, 800], [1920, 675], [1200, 1080]]) expect(isLivHeroDimensions({ width, height })).toBe(false);
  expect(isLivHeroDimensions({ width: 1200, height: 675 })).toBe(true);
  expect(isLivHeroDimensions({ width: 1920, height: 1080 })).toBe(true);
});
