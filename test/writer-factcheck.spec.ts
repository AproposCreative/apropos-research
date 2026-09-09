import { expect, it, vi } from 'vitest';
import { writerFactcheckInput, runWriterFactcheck } from '@/lib/ai-chat/writer-factcheck';
const article = { title: 'Titel', intro: 'Intro', content: 'En lang artikel '.repeat(800),
  researchSelected: { url: 'https://soundvenue.com/a' }, researchSources: [{ url: 'https://soundvenue.com/a' }, { url: 'https://kino.dk/b' }] };
it('sends full text and deduplicated source URLs using the grounded API contract', async () => {
  const call = vi.fn().mockResolvedValue(new Response(JSON.stringify({ complete: true, verificationMethod: 'retrieved-sources', results: [{ status: 'verified' }] })));
  expect((await runWriterFactcheck(article, call)).complete).toBe(true);
  expect(JSON.parse(call.mock.calls[0][1].body)).toEqual(writerFactcheckInput(article));
  expect(writerFactcheckInput(article).articleText).toContain(article.content);
  expect(writerFactcheckInput(article).sourceUrls).toHaveLength(2);
});
it('does not claim completion when sources are missing', async () => {
  const call = vi.fn();
  expect((await runWriterFactcheck({ content: 'Artikel' }, call)).complete).toBe(false);
  expect(call).not.toHaveBeenCalled();
});
it.each([new Response('', { status: 500 }), new Response(JSON.stringify({ results: [{ status: 'true' }] }))])('fails closed for unavailable or legacy response', async response => {
  expect((await runWriterFactcheck(article, vi.fn().mockResolvedValue(response))).complete).toBe(false);
});
