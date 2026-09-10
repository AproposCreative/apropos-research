/** Wrap every word; long unbroken tokens may wrap between Unicode characters. */
export function wrapCardText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= width) { line = next; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const char of Array.from(word)) {
      if (line && measure(line + char) > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest whole-pixel font within the design's line budget. Never deletes copy. */
export function fitCardText(ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>, text: string,
  width: number, maxLines: number, maxSize: number, font: (size: number) => string) {
  const layout = (size: number) => {
    ctx.font = font(size);
    return wrapCardText(text, width, value => ctx.measureText(value).width);
  };
  let low = 1;
  let high = maxSize;
  let best = 1;
  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    const lines = layout(size);
    if (lines.length <= maxLines && lines.every(line => ctx.measureText(line).width <= width)) {
      best = size; low = size + 1;
    } else high = size - 1;
  }
  const lines = layout(best);
  if (lines.length > maxLines || lines.some(line => ctx.measureText(line).width > width)) {
    throw new Error('Teksten er for lang til kortet. Forkort den før eksport.');
  }
  return { fontSize: best, lines };
}
