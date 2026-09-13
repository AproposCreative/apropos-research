import { expect, it } from 'vitest';
import { operationsBudgetLabel } from '@/lib/editorial-operations-view';

it.each([null, undefined, NaN, Infinity, -1])('shows unknown usage without throwing or claiming zero: %s', usage => {
  expect(operationsBudgetLabel({ usageBasedUpperDkk: usage, monthlyLimitDkk: 300 }))
    .toBe('Registreret forbrug er endnu ukendt.');
});
it('distinguishes an unavailable section from an unknown amount', () => {
  expect(operationsBudgetLabel(null)).toBe('Status utilgængelig');
});
it('preserves a genuine zero and formats Danish amounts', () => {
  expect(operationsBudgetLabel({ usageBasedUpperDkk: 0, monthlyLimitDkk: 300 })).toBe('0,00 kr. registreret af 300 kr.');
  expect(operationsBudgetLabel({ usageBasedUpperDkk: 46.625, monthlyLimitDkk: 300 })).toBe('46,63 kr. registreret af 300 kr.');
});
it.each([undefined, NaN, -1, 0])('does not invent a missing limit: %s', limit => {
  expect(operationsBudgetLabel({ usageBasedUpperDkk: 4, monthlyLimitDkk: limit }))
    .toBe('4,00 kr. registreret. Budgetgrænsen er ukendt.');
});
