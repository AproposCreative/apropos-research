import { beforeEach, expect, it, vi } from 'vitest';
import { assertEnglishProse, isDanishArticleCopy, richTextStructure } from '@/lib/articles/english-language';
import { protectEnglishArticleLocale } from '@/lib/webflow/english-article-guard';
import { runArticleTranslation } from '@/lib/webflow/article-translation';
import { WebflowLocaleFetchError } from '@/lib/webflow/locale-items';

const id = 'a'.repeat(24);
const dk = 'b'.repeat(24);
const en = 'c'.repeat(24);
const danish = {
  name: 'Eksempel', slug: 'eksempel', intro: 'En film om det ansvar vi har for hinanden.',
  content: '<p>Der var noget ved filmen, som hun havde svært ved at sætte ord på. Men hun blev ved med at tænke på de mennesker, der ikke kunne se, hvad det betød at være sammen med hinanden.</p>',
};
const english = {
  name: 'Example', slug: 'example', intro: 'A film about the responsibility we have for one another.',
  content: '<p>There was something about the film that she found hard to put into words. Yet she kept thinking about the people who could not see what it meant to spend time together.</p>',
};
function absent(): never { throw new WebflowLocaleFetchError('Fixture missing', 404); }
const stamp = '2026-11-05T08:00:00.000Z';
const item = (fields: Record<string, unknown>, cmsLocaleId: string, live = true) => ({ id, cmsLocaleId, fieldData: fields, isDraft: !live, lastPublished: live ? stamp : null });
const setup = vi.hoisted(() => ({
  read: vi.fn(), unpublish: vi.fn(), create: vi.fn(), patch: vi.fn(), publish: vi.fn(), reserve: vi.fn(), release: vi.fn(),
  translate: vi.fn(), client: vi.fn(), setState: vi.fn(), logJob: vi.fn(), policy: vi.fn(),
}));
vi.mock('@/lib/webflow/locale-items', () => ({
  resolveWebflowLocaleIds: () => ({ dk, en }), fetchArticleItemByLocale: setup.read,
  unpublishEnglishArticle: setup.unpublish, createEnglishArticleVariant: setup.create,
  patchArticleFieldDataForLocale: setup.patch, publishArticleItemForLocale: setup.publish,
  WebflowLocaleFetchError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({
  acquireCmsWriteLease: async () => ({ assertOwned: setup.reserve, release: setup.release }),
}));
vi.mock('@/lib/ai/manual-writer-budget', () => ({ readManualWriterBudget: setup.policy }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: setup.client }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: (name: string) => name === 'articleTranslationJobs' ? { add: setup.logJob } : {
  doc: () => ({ get: async () => ({ data: () => undefined }), set: setup.setState }),
} }) }));
vi.mock('@/lib/articles/translate-to-english', () => ({
  translateArticleToEnglish: setup.translate, buildEnglishFieldData: (_input: object, result: Record<string, unknown>) => result,
}));

beforeEach(() => {
  vi.resetAllMocks();
  setup.logJob.mockResolvedValue(undefined);
  setup.policy.mockResolvedValue(null);
  setup.client.mockReturnValue({});
  setup.translate.mockResolvedValue(english);
});

it('detects the same Danish prose even when Webflow changed the image file', () => {
  const a = { content: `${danish.content}<img src="photo.jpg">` };
  const b = { content: `${danish.content}<img src="photo.webp">` };
  expect(isDanishArticleCopy(a, b)).toBe(true);
  expect(isDanishArticleCopy(a, english)).toBe(false);
  expect(() => assertEnglishProse(a, b)).toThrow('Dansk tekst');
  expect(() => assertEnglishProse(danish, { ...english, content: english.content + danish.content })).toThrow('dansk afsnit');
  expect(richTextStructure(a.content)).not.toBe(richTextStructure(b.content));
});

it('takes only a confirmed Danish copy offline in the English locale', async () => {
  let removed = false;
  setup.read.mockImplementation(async (_id, locale) => locale === dk ? item(danish, dk) : removed ? absent() : item(danish, en));
  setup.unpublish.mockImplementation(async () => { removed = true; });
  expect(await protectEnglishArticleLocale(id)).toBe(true);
  expect(setup.unpublish).toHaveBeenCalledExactlyOnceWith(id);
  expect(setup.reserve).toHaveBeenCalledTimes(1);
  expect(setup.release).toHaveBeenCalledTimes(1);
});

it('preserves a separately edited English draft and a genuine English live article', async () => {
  setup.read.mockImplementation(async (_id, locale, options) => locale === dk ? item(danish, dk) : options.live ? item(danish, en) : item(english, en));
  expect(await protectEnglishArticleLocale(id)).toBe(false);
  setup.read.mockImplementation(async (_id, locale) => locale === dk ? item(danish, dk) : item(english, en));
  expect(await protectEnglishArticleLocale(id)).toBe(false);
  expect(setup.unpublish).not.toHaveBeenCalled();
});

it('honours the manual Writer policy before any backend model or publication', async () => {
  setup.read.mockImplementation(async (_id, locale) => locale === dk ? item(danish, dk) : absent());
  setup.policy.mockResolvedValue({ mode: 'manual-writer-only-v1' });
  expect(await runArticleTranslation(id)).toMatchObject({ skipped: true, reason: expect.stringContaining('Writer') });
  expect(setup.client).not.toHaveBeenCalled();
  expect(setup.publish).not.toHaveBeenCalled();
});

it('creates an English draft only after translation, then confirms the live EN readback', async () => {
  let created = false;
  let live = false;
  setup.read.mockImplementation(async (_id, locale, options) => {
    if (locale === dk) return item(danish, dk);
    if (options.live) return live ? item(english, en) : absent();
    return created ? item(english, en, live) : absent();
  });
  setup.create.mockImplementation(async () => { created = true; });
  setup.publish.mockImplementation(async () => { live = true; });
  expect(await runArticleTranslation(id)).toMatchObject({ skipped: false, enName: 'Example' });
  expect(setup.create).toHaveBeenCalledExactlyOnceWith(id, english);
  expect(setup.publish).toHaveBeenCalledExactlyOnceWith(id, en);
  expect(setup.setState).toHaveBeenCalledWith(expect.objectContaining({ targetHash: expect.any(String) }), { merge: true });
});

it('does not publish after an editorial edit during the translation', async () => {
  let changed = false;
  setup.read.mockImplementation(async (_id, locale) => locale === dk ? item({ ...danish, name: changed ? 'Ændret' : danish.name }, dk) : absent());
  setup.translate.mockImplementation(async () => { changed = true; return english; });
  await expect(runArticleTranslation(id)).rejects.toThrow('ændret under');
  expect(setup.create).not.toHaveBeenCalled();
  expect(setup.publish).not.toHaveBeenCalled();
});
