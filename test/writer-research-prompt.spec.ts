import { expect, it } from 'vitest';
import { EDITORIAL_ARTICLE_TYPE_OPTIONS } from '@/lib/editorial/signal-store';
import { writerResearchLengthInstruction } from '@/lib/ai-chat/article-length';
it.each(EDITORIAL_ARTICLE_TYPE_OPTIONS)('uses canonical $id length even when older context disagrees', option => {
  const instruction = writerResearchLengthInstruction({ articleType: option.id, targetLengthLabel: '800-1200 ord', targetWordCount: 100 });
  expect(instruction).toContain(option.targetLengthLabel);
  expect(instruction).toContain('Opfind ikke stof');
});
