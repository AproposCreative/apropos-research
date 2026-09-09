import { expect, it } from 'vitest';
import { writerArticleBody } from '@/lib/ai-chat/article-content';
it('does not turn chat instructions into article content', () => {
  expect(writerArticleBody({ _chatMessages: [{ role: 'assistant', content: 'Sæt en titel først.' }] })).toBe('');
});
it('uses canonical content and respects an explicitly cleared body', () => {
  expect(writerArticleBody({ content: '', 'post-body': 'Old body' })).toBe('');
  expect(writerArticleBody({ content: 'New body', 'post-body': 'Old body' })).toBe('New body');
  expect(writerArticleBody({ 'post-body': 'Imported body' })).toBe('Imported body');
});
