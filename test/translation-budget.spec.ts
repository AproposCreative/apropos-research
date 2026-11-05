import { afterEach, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { ARTICLE_TRANSLATION_MODEL } from '@/lib/articles/translation-policy';
import { translateArticleToEnglish } from '@/lib/articles/translate-to-english';
const create = vi.fn();
const client = { chat: { completions: { create } } } as unknown as OpenAI;
const dk = { name: 'Kultur', intro: 'Intro', content: '<p>Dansk tekst</p>' };
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('makes one bounded request to the priced translation model', async () => {
  create.mockImplementation(async (body, options) => {
    expect(body.model).toBe(ARTICLE_TRANSLATION_MODEL);
    expect(body.max_completion_tokens).toBe(8000);
    expect(options).toEqual({ maxRetries: 0, timeout: 60000 });
    return { choices: [{ finish_reason: 'stop', message: { content: '{"name":"Culture","intro":"Introduction","content":"<p>English text</p>"}' } }] };
  });
  expect((await translateArticleToEnglish(client, dk)).name).toBe('Culture');
  expect(create).toHaveBeenCalledTimes(1);
});
it('does not silently truncate the source', async () => {
  await expect(translateArticleToEnglish(client, { ...dk, content: 'x'.repeat(48001) })).rejects.toThrow('for lang');
  expect(create).not.toHaveBeenCalled();
});
it.each([{ finish: 'length', content: '{"name":"Culture","content":"Partial"}' }, { finish: 'stop', content: '{}' }])('rejects incomplete output before CMS field construction', async value => {
  create.mockResolvedValue({ choices: [{ finish_reason: value.finish, message: { content: value.content } }] });
  await expect(translateArticleToEnglish(client, dk)).rejects.toThrow('CMS er ikke ændret');
});
