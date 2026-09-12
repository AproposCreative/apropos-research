import { expect, it } from 'vitest';
import { getEditorialArticleTypeOption } from '@/lib/editorial/signal-store';
import { writerLengthPolicy } from '@/lib/ai-chat/article-length';

it.each([
  ['short-news', 300, 500, 400],
  ['review', 500, 850, 675],
  ['feature', 600, 900, 750],
  ['analysis', 600, 900, 750],
  ['commentary', 450, 750, 600],
  ['longread', 1400, 1800, 1600],
] as const)('uses approved %s defaults and preserves an explicitly selected template', (articleType, min, max, target) => {
  expect(getEditorialArticleTypeOption(articleType)).toMatchObject({ id: articleType, targetWordCount: target, targetLengthLabel: `${min}-${max} ord` });
  expect(writerLengthPolicy({ articleType, targetWordCount: 99999, targetLengthLabel: '99999 ord', section: 'Film' }))
    .toEqual({ articleType, min, max, target, label: `${min}-${max} ord` });
});

it.each([undefined, null, '', 'invalid', 'Feature'])('does not silently opt into a longer template for %s', value => {
  expect(getEditorialArticleTypeOption(value).id).toBe('short-news');
});
