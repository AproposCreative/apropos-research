import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { EDITORIAL_ARTICLE_TYPE_OPTIONS } from '@/lib/editorial/signal-store';
import { writerLengthCheck, writerLengthPolicy } from '@/lib/ai-chat/article-length';
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: mock.create } } }), models: { default: 'fixture' } }));
vi.mock('@/lib/research/service', () => ({ getResearch: async () => ({ sources: [], contextText: '', debug: {} }) }));
import { POST } from '@/app/api/ai-chat/route';

const words = (n: number) => Array(n).fill('ord').join(' ');
const completion = (n: number, finish = 'stop') => ({ choices: [{ finish_reason: finish, message: {
  content: `Arbejdstitel: En præcis kulturtitel\nUndertitel: En konkret undertitel\nIntro: En separat intro.\n\nBrødtekst:\n${words(n)}`,
} }] });
const request = (articleType = 'short-news') => new NextRequest('https://studio.example/api/ai-chat', { method: 'POST', body: JSON.stringify({
  message: 'Skriv en artikel', articleData: { articleType, section: 'Serier & Film', targetLengthLabel: '99999 ord', targetWordCount: 99999 },
}) });
beforeEach(() => vi.resetAllMocks());

it.each(EDITORIAL_ARTICLE_TYPE_OPTIONS)('honours $id template boundaries independently of category', option => {
  const policy = writerLengthPolicy({ articleType: option.id, section: 'Kultur', targetWordCount: 50000 });
  expect(policy.target).toBe(option.targetWordCount);
  expect(writerLengthCheck(words(policy.min), { articleType: option.id }).pass).toBe(true);
  expect(writerLengthCheck(words(policy.max), { articleType: option.id }).pass).toBe(true);
  expect(writerLengthCheck(words(policy.min - 1), { articleType: option.id }).pass).toBe(false);
  expect(writerLengthCheck(words(policy.max + 1), { articleType: option.id }).pass).toBe(false);
});
it('does not expand a valid short news item to the old film minimum', async () => {
  mock.create.mockResolvedValue(completion(550));
  const data = await (await POST(request())).json();
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(data.articleUpdate.lengthCheck).toMatchObject({ actual: 550, pass: true });
});
it.each([300, 1100])('repairs out-of-range draft %s once', async n => {
  mock.create.mockResolvedValueOnce(completion(n)).mockResolvedValueOnce(completion(550));
  const data = await (await POST(request())).json();
  expect(mock.create).toHaveBeenCalledTimes(2);
  expect(data.articleUpdate.lengthCheck.pass).toBe(true);
  expect(mock.create.mock.calls[1][0].messages[1].content).toContain('450-650');
});
it('retains the draft but reports a failed repair instead of claiming length compliance', async () => {
  mock.create.mockResolvedValueOnce(completion(300)).mockResolvedValueOnce(completion(200));
  const data = await (await POST(request())).json();
  expect(data.articleUpdate.lengthCheck).toMatchObject({ actual: 300, pass: false });
  expect(data.warnings[0]).toContain('Længde kræver rettelse');
});
it('rejects truncated generation without updating the article', async () => {
  mock.create.mockResolvedValue(completion(300, 'length'));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty('articleUpdate');
});
it('does not treat a long chat answer as a replacement article', async () => {
  mock.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: words(300) } }] });
  const data = await (await POST(request())).json();
  expect(data).not.toHaveProperty('articleUpdate');
  expect(mock.create).toHaveBeenCalledTimes(1);
});
it('checks the complete body and warns when the quick editorial check is unavailable', async () => {
  mock.create.mockResolvedValueOnce(completion(1400)).mockRejectedValueOnce(new Error('fixture outage'));
  const req = new NextRequest('https://studio.example/api/ai-chat', { method: 'POST', body: JSON.stringify({ message: 'Skriv en artikel', clientRequestId: 'writer-quality-fixture', articleData: { articleType: 'longread' } }) });
  const data = await (await POST(req)).json();
  expect(mock.create.mock.calls[1][0].messages[1].content).toBe(words(1400));
  expect(data.warnings).toContain('Den hurtige redaktionelle kontrol kunne ikke gennemføres. Udkastet er ikke kvalitetsgodkendt.');
});
