import { fitCardText, wrapCardText } from './fitCardText';

export const MIN_TEXT_SIZE_PERCENT = 70;
export const MAX_TEXT_SIZE_PERCENT = 150;
export const TEXT_SIZE_STEP = 10;

export function textSizePercent(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_TEXT_SIZE_PERCENT, Math.max(MIN_TEXT_SIZE_PERCENT, value)) : 100;
}

/** Resize from the automatic fit, then wrap at the chosen size. A larger size
 * must actually grow the text rather than silently shrinking it to two lines. */
export function sizeCardText(ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  text: string, width: number, maxLines: number, maxSize: number,
  font: (size: number) => string, percent?: number) {
  const fitted = fitCardText(ctx, text, width, maxLines, maxSize, font);
  const adjustment = textSizePercent(percent);
  if (adjustment === 100) return fitted;
  const fontSize = Math.max(1, Math.round(fitted.fontSize * adjustment / 100));
  ctx.font = font(fontSize);
  return { fontSize, lines: wrapCardText(text, width, value => ctx.measureText(value).width) };
}
