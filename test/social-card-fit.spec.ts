import { describe, expect, it } from 'vitest';
import { fitCardText, wrapCardText } from '../app/design-editor/fitCardText';

function context() {
  return { font: '', measureText(text: string) { return { width: Array.from(text).length * Number(this.font.match(/([\d.]+)px/)?.[1] || 1) * .5 }; } };
}
const title = 'Endelig en rotte, København ikke kan ignorere';
const font = (size: number) => `400 ${size}px Amiri`;
describe('social card copy fitting', () => {
  it('retains the complete regression title and selects the largest fitting font', () => {
    const ctx = context();
    const fit = fitCardText(ctx, title, 880, 2, 100, font);
    expect(fit.lines.join(' ')).toBe(title);
    expect(fit.fontSize).toBeLessThan(100);
    ctx.font = font(fit.fontSize + 1);
    expect(wrapCardText(title, 880, t => ctx.measureText(t).width).length).toBeGreaterThan(2);
  });
  it('keeps short text at the design maximum', () => {
    expect(fitCardText(context(), 'Kort titel', 880, 2, 80, font).fontSize).toBe(80);
  });
  it('preserves long subtitles in both line budgets', () => {
    const text = 'Esben Weile Kjærs THIRST TRAP giver skadedyrene hovedrollen i Ørstedsparken. En udstilling om vores forhold til naturen og hinanden.';
    for (const lines of [2, 3]) {
      const fit = fitCardText(context(), text, 880, lines, 60, font);
      expect(fit.lines.join(' ')).toBe(text);
      expect(fit.lines.length).toBeLessThanOrEqual(lines);
    }
  });
  it('wraps an unbroken word without losing Unicode characters', () => {
    const text = 'Æøå🎨'.repeat(50);
    const ctx = context();
    const fit = fitCardText(ctx, text, 880, 2, 80, font);
    expect(fit.lines.join('')).toBe(text);
    expect(fit.lines.every(line => ctx.measureText(line).width <= 880)).toBe(true);
  });
  it('does not remove grammatical endings or mutate source copy between formats', () => {
    const text = 'Det er det, vi lever for';
    for (const width of [880, 992, 880]) expect(fitCardText(context(), text, width, 2, 100, font).lines.join(' ')).toBe(text);
  });
});
