import { expect, it } from 'vitest';
import { EDITORIAL_ARTICLE_TYPE_OPTIONS } from '@/lib/editorial/signal-store';
import { writerResearchLengthInstruction } from '@/lib/ai-chat/article-length';
import { buildPromptSegments } from '@/lib/ai-chat/build-system-prompt';
it.each(EDITORIAL_ARTICLE_TYPE_OPTIONS)('uses canonical $id length even when older context disagrees', option => {
  const instruction = writerResearchLengthInstruction({ articleType: option.id, targetLengthLabel: '800-1200 ord', targetWordCount: 100 });
  expect(instruction).toContain(option.targetLengthLabel);
  expect(instruction).toContain('Opfind ikke stof');
  expect(instruction).toContain('eksklusive titel, undertitel, intro, mellemrubrikker, billedtekster, billedcredits, indlejrede medier og metadata');
});

it.each(EDITORIAL_ARTICLE_TYPE_OPTIONS)('keeps the $id Writer system prompt aligned with the body-counter exclusions', option => {
  const context = { articleType: option.id, targetWordCount: 99999 };
  const prompt = buildPromptSegments('', 'Fixture Author', context, undefined, { openingStrategyOverride: 'Fixture opening' })
    .map(segment => segment.content).join('\n');
  const exclusions = writerResearchLengthInstruction(context).split('eksklusive ')[1].split('.')[0];
  expect(prompt).toContain(`Brødtekst: ${option.targetLengthLabel} (ca. ${option.targetWordCount} ord), eksklusive ${exclusions}.`);
});
