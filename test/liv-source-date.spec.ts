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
it('preserves Danish publication time in the Copenhagen summer timezone', () => {
  expect(currentSourceDate('09.09.2026 / 14:52', now)).toBe('2026-09-09T12:52:00.000Z');
  expect(currentSourceDate('09.09.2026 / 17:00', now)).toBeNull();
});
it('uses winter time rather than a fixed summer offset', () => {
  expect(currentSourceDate('09.01.2026 / 10:52', Date.parse('2026-01-09T12:00:00Z')))
    .toBe('2026-01-09T09:52:00.000Z');
});
it.each(['09.09.2026 / 24:00', '09.09.2026 / 12:99', '2026-09-08T24:00:00Z', '2026-09-09T10:00:60Z'])('rejects invalid times rather than normalizing them: %s', value => {
  expect(currentSourceDate(value, now)).toBeNull();
});
it('rejects nonexistent and ambiguous Danish daylight-saving times', () => {
  expect(currentSourceDate('29.03.2026 / 02:30', Date.parse('2026-03-29T12:00:00Z'))).toBeNull();
  expect(currentSourceDate('25.10.2026 / 02:30', Date.parse('2026-10-25T12:00:00Z'))).toBeNull();
});
it('accepts unambiguous times on both sides of the summer-time transition', () => {
  const day = Date.parse('2026-03-29T12:00:00Z');
  expect(currentSourceDate('29.03.2026 / 01:30', day)).toBe('2026-03-29T00:30:00.000Z');
  expect(currentSourceDate('29.03.2026 / 03:30', day)).toBe('2026-03-29T01:30:00.000Z');
});
it('enforces the precise seven-day and five-minute boundaries', () => {
  expect(currentSourceDate('2026-09-02T13:00:00Z', now)).not.toBeNull();
  expect(currentSourceDate('2026-09-02T12:59:59Z', now)).toBeNull();
  expect(currentSourceDate('2026-09-09T13:05:00Z', now)).not.toBeNull();
  expect(currentSourceDate('2026-09-09T13:05:01Z', now)).toBeNull();
});
it.each([NaN, Infinity, -Infinity])('fails closed with an invalid reference clock: %s', clock => {
  expect(currentSourceDate('2026-09-09', clock)).toBeNull();
});
