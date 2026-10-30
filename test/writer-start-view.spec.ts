import { expect, it } from 'vitest';
import { resolveViewFromSearchParams } from '../app/ai/ai-writer/article-defaults';

it('opens Writer on the desktop root while retaining the mobile launcher', () => {
  expect(resolveViewFromSearchParams(new URLSearchParams(), 'ai')).toBe('ai');
  expect(resolveViewFromSearchParams(new URLSearchParams(), null)).toBeNull();
  expect(resolveViewFromSearchParams(new URLSearchParams('unrelated=1'), 'ai')).toBe('ai');
});
it.each(['ai', 'design-editor', 'newsletter', 'dashboard', 'podcast', 'push', 'liv', 'akkreditering', 'liv-inbox', 'image-gen', 'seo'] as const)(
  'preserves an explicit %s deep link on both screen sizes', view => {
    for (const fallback of ['ai', null] as const) expect(resolveViewFromSearchParams(new URLSearchParams({ view }), fallback)).toBe(view);
  });
it.each([
  ['newsletter=1', 'newsletter'], ['webapp=newsletter', 'newsletter'], ['webapp=dashboard', 'dashboard'],
  ['webapp=podcast', 'podcast'], ['webapp=push-desk', 'push'], ['webapp=liv-desk', 'liv'],
  ['webapp=akkreditering', 'akkreditering'], ['webapp=liv-inbox', 'liv-inbox'],
])('retains a legacy bookmarked route: %s', (query, view) => {
  expect(resolveViewFromSearchParams(new URLSearchParams(query), 'ai')).toBe(view);
});
