/** Exact 16:9 deliverables. Photography must never enlarge the oriented source. */
export type LivHeroDimensions = { width: 1920; height: 1080 } | { width: 1200; height: 675 };

export function isLivHeroDimensions(value: { width?: number; height?: number }): value is LivHeroDimensions {
  return (value.width === 1920 && value.height === 1080) || (value.width === 1200 && value.height === 675);
}

export function chooseLivHeroDimensions(width: number, height: number, orientation = 1): LivHeroDimensions | null {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)) return null;
  if (orientation >= 5 && orientation <= 8) [width, height] = [height, width];
  if (width >= 1920 && height >= 1080) return { width: 1920, height: 1080 };
  if (width >= 1200 && height >= 675) return { width: 1200, height: 675 };
  return null;
}
