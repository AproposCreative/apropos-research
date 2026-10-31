import { expect, it } from 'vitest';
import { audiencePageProof } from '@/lib/newsletter/audience-completeness';
function enumerate(pages: unknown[], field: string, cap: number) {
  let valid = true, total = 0;
  for (const page of pages) {
    const proof = audiencePageProof(page, field, 100); valid = valid && proof.valid;
    const rows = (page as Record<string, unknown>)?.[field];
    total += Array.isArray(rows) ? rows.length : 0;
    if (proof.terminal) return valid;
    if (total >= cap) return false;
    if (!proof.valid) return false;
  }
  return false;
}
it('proves only well-formed terminal pages, never malformed200 or full-cap exhaustion', () => {
  for (const field of ['items', 'formSubmissions', 'forms']) {
    expect(audiencePageProof({}, field, 100)).toEqual({ valid: false, terminal: false });
    expect(audiencePageProof({ [field]: 'not-array' }, field, 100).valid).toBe(false);
    expect(enumerate([{ [field]: [] }], field, 5000)).toBe(true);
    expect(enumerate([{ [field]: Array(100).fill({}) }, { [field]: Array(7).fill({}) }], field, 5000)).toBe(true);
    expect(enumerate(Array(50).fill({ [field]: Array(100).fill({}) }), field, 5000)).toBe(false);
    expect(enumerate(Array(100).fill({ [field]: Array(100).fill({}) }), field, 10000)).toBe(false);
    expect(enumerate([{ [field]: Array(100).fill({}) }, {}], field, 10000)).toBe(false);
  }
});
