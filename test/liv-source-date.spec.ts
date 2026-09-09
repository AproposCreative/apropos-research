import { expect, it } from 'vitest';
import { currentSourceDate } from '@/lib/liv/source-date';
const now = Date.parse('2026-09-09T13:00:00Z');
it('interprets Danish day.month.year without US month/day swapping', () => {
  expect(currentSourceDate('08.09.2026', now)).toBe('2026-09-08T00:00:00.000Z');
});
it.each(['12.05.2026', '2026-12-05T00:00:00Z', undefined, '', '09/08/2026', '31.09.2026', '2025-09-09'])('rejects stale, future, missing or ambiguous dates: %s', value => {
  expect(currentSourceDate(value, now)).toBeNull();
});
it('accepts recent ISO dates and rejects a future timestamp', () => {
  expect(currentSourceDate('2026-09-09T10:00:00Z', now)).toBe('2026-09-09T10:00:00.000Z');
  expect(currentSourceDate('2026-09-09T15:00:00Z', now)).toBeNull();
});
it('rejects impossible ISO dates and timestamps without timezone', () => {
  expect(currentSourceDate('2026-02-30', Date.parse('2026-03-03T12:00:00Z'))).toBeNull();
  expect(currentSourceDate('2026-09-09T10:00:00', now)).toBeNull();
});
