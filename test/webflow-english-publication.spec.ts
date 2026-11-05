import { beforeEach, expect, it, vi } from 'vitest';
import { assertEnglishProse, isDanishArticleCopy, richTextStructure } from '@/lib/articles/english-language';
import { protectEnglishArticleLocale } from '@/lib/webflow/english-article-guard';
import { runArticleTranslation } from '@/lib/webflow/article-translation';
import { WebflowLocaleFetchError } from '@/lib/webflow/locale-items';
import { currentLivCostContext } from '@/lib/liv/cost-context';
import { NextRequest } from 'next/server';
import { POST as receiveWebflowPublish } from '@/app/api/webhooks/webflow/route';
import { GET as recoverTranslations } from '@/app/api/cron/article-translation/route';

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
  translate: vi.fn(), client: vi.fn(), setState: vi.fn(), readState: vi.fn(), logJob: vi.fn(), enabled: vi.fn(),
  after: vi.fn(), saveQueued: vi.fn(),
}));
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: setup.after }));
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_API_TOKEN: 'fixture' } }));
vi.mock('@/lib/webflow/article-image-auto-optimize', () => ({ isArticleCollectionWebhookEvent: () => true,
  isArticleImageAutoOptimizeEnabled: () => false, isArticleWebhookOptimizeEnabled: () => false }));
vi.mock('@/lib/webflow/published-image-optimization', () => ({ optimizePublishedArticleImages: vi.fn() }));
vi.mock('@/lib/seo-engine/settings', () => ({ resolveAutoSeoEngineEnabled: async () => false }));
vi.mock('@/lib/seo-engine/after-publish', () => ({ maybeEnqueueSeoEngineAfterPublish: vi.fn() }));
vi.mock('@/lib/seo-engine/opportunity-engine/settings', () => ({ resolveAutomaticOpportunityRuntime: async () => ({ shouldAutoFillOnPublish: false }) }));
vi.mock('@/lib/webflow/locale-items', () => ({
  resolveWebflowLocaleIds: () => ({ dk, en }), fetchArticleItemByLocale: setup.read,
  isArticleAutoTranslateEnabledAsync: setup.enabled,
  unpublishEnglishArticle: setup.unpublish, createEnglishArticleVariant: setup.create,
  patchArticleFieldDataForLocale: setup.patch, publishArticleItemForLocale: setup.publish,
  WebflowLocaleFetchError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({
  acquireCmsWriteLease: async () => ({ assertOwned: setup.reserve, release: setup.release }),
}));
vi.mock('@/lib/webflow/article-translation-settings', () => ({ resolveAutoTranslateEnabled: setup.enabled }));
vi.mock('@/lib/openai', () => ({ getArticleTranslationOpenAIClient: setup.client }));
type FixtureRow = Record<string, unknown>;
type QueueRef = { id: string };
const queued = new Map<string, FixtureRow>();
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => {
    const state = { get: async () => ({ data: setup.readState }), set: setup.setState };
    const receipt = { set: setup.logJob };
    const makeQueueRef = (jobId: string) => ({
      id: jobId,
      create: async (value: FixtureRow) => {
        await setup.saveQueued();
        if (queued.has(jobId)) throw Object.assign(new Error('Already exists'), { code: 6 });
        queued.set(jobId, value);
      },
      firestore: {
        runTransaction: async (callback: (tx: {
          get: (ref: QueueRef) => Promise<{ data: () => FixtureRow | undefined }>;
          update: (ref: QueueRef, patch: FixtureRow) => void;
        }) => Promise<unknown>) => callback({
          get: async ref => ({ data: () => queued.get(ref.id) }),
          update: (ref, patch) => { queued.set(ref.id, { ...queued.get(ref.id), ...patch }); },
        }),
      },
    });
    return {
      collection: (name: string) => {
        if (name === 'articleTranslationJobs') return { add: setup.logJob, doc: () => receipt };
        if (name === 'articleTranslationQueue') return {
          doc: makeQueueRef,
          where: (_key: string, _op: string, due: number) => ({ orderBy: () => ({ limit: () => ({
            get: async () => {
              const docs = [...queued.entries()].filter(([, row]) => typeof row.dueAt === 'number' && row.dueAt <= due)
                .map(([id]) => ({ id, ref: makeQueueRef(id) }));
              return { docs, size: docs.length };
            },
          }) }) }),
        };
        return { doc: () => state };
      },
      batch: () => {
        const writes: Array<() => unknown> = [];
        return {
          set: (ref: typeof state | typeof receipt, fields: FixtureRow, options?: object) => {
            writes.push(() => ref.set(fields, ...(options ? [options] : [])));
          },
          commit: async () => Promise.all(writes.map(write => write())),
        };
      },
    };
  },
}));
vi.mock('@/lib/articles/translate-to-english', () => ({
  translateArticleToEnglish: setup.translate, buildEnglishFieldData: (_input: object, result: Record<string, unknown>) => result,
}));

beforeEach(() => {
  vi.resetAllMocks();
  queued.clear();
  setup.logJob.mockResolvedValue(undefined);
  setup.enabled.mockResolvedValue(true);
  setup.client.mockReturnValue({});
  setup.translate.mockResolvedValue(english);
});

const publishDelivery = (cmsLocaleId = dk) => new NextRequest('https://test.example/api/webhooks/webflow', {
  method: 'POST', headers: { 'x-webflow-webhook-secret': 'fixture', 'x-webflow-timestamp': 'fixture-delivery' },
  body: JSON.stringify({ triggerType: 'collection_item_published', payload: { id, cmsLocaleId } }),
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

it('honours the translation switch before any backend model or publication', async () => {
  setup.read.mockImplementation(async (_id, locale) => locale === dk ? item(danish, dk) : absent());
  setup.enabled.mockResolvedValue(false);
  expect(await runArticleTranslation(id, { force: true })).toMatchObject({ skipped: true, reason: expect.stringContaining('slået fra') });
  expect(setup.client).not.toHaveBeenCalled();
  expect(setup.publish).not.toHaveBeenCalled();
});

it('translates a Danish publish webhook, confirms live EN and ignores the resulting EN publish', async () => {
  let created = false;
  let live = false;
  setup.read.mockImplementation(async (_id, locale, options) => {
    if (locale === dk) return item(danish, dk);
    if (options.live) return live ? item(english, en) : absent();
    return created ? item(english, en, live) : absent();
  });
  setup.create.mockImplementation(async () => { created = true; });
  setup.translate.mockImplementation(async () => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'article-translation', storyId: id, contentVersion: expect.any(String) });
    return english;
  });
  setup.publish.mockImplementation(async () => { live = true; });
  vi.stubEnv('WEBFLOW_WEBHOOK_SECRET', 'fixture');
  try {
    const result = await receiveWebflowPublish(publishDelivery());
    expect(await result.json()).toMatchObject({ ok: true, translationQueued: [id] });
    expect(setup.after).toHaveBeenCalledOnce();
    await setup.after.mock.calls[0][0]();
    expect(setup.logJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', enName: 'Example', source: 'webhook:collection_item_published' }));
    const englishResult = await receiveWebflowPublish(publishDelivery(en));
    expect(await englishResult.json()).toMatchObject({ ok: true, translationQueued: [] });
    expect(setup.after).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllEnvs();
  }
  expect(setup.create).toHaveBeenCalledExactlyOnceWith(id, english);
  expect(setup.publish).toHaveBeenCalledExactlyOnceWith(id, en);
  expect(setup.setState).toHaveBeenCalledWith(expect.objectContaining({ targetHash: expect.any(String) }), { merge: true });
});

it('recovers a persisted webhook after its background execution never starts and retries a CMS timeout without buying a second translation', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(stamp));
  vi.stubEnv('WEBFLOW_WEBHOOK_SECRET', 'fixture');
  vi.stubEnv('CRON_SECRET', 'cron-fixture');
  const tick = () => recoverTranslations(new NextRequest('https://test.example/api/cron/article-translation', {
    headers: { authorization: 'Bearer cron-fixture' },
  }));
  try {
    let staged = false;
    let live = false;
    const saved: FixtureRow = {};
    setup.readState.mockReturnValue(saved);
    setup.setState.mockImplementation(async patch => Object.assign(saved, patch));
    setup.read.mockImplementation(async (_id, locale, options) => locale === dk ? item(danish, dk) :
      options.live ? (live ? item(english, en) : absent()) : (staged ? item(english, en, live) : absent()));
    setup.create.mockImplementation(async () => { staged = true; });
    setup.publish.mockRejectedValueOnce(new Error('Webflow unavailable')).mockImplementationOnce(async () => { live = true; });

    expect((await receiveWebflowPublish(publishDelivery())).status).toBe(200);
    expect((await receiveWebflowPublish(publishDelivery())).status).toBe(200);
    expect(queued.size).toBe(1);
    expect(setup.translate).not.toHaveBeenCalled();
    expect(await (await tick()).json()).toMatchObject({ considered: 1 });
    expect(await (await tick()).json()).toMatchObject({ considered: 0 });
    clock.mockReturnValue(Date.parse(stamp) + 5 * 60_000);
    expect(await (await tick()).json()).toMatchObject({ considered: 1 });
    expect(await (await tick()).json()).toMatchObject({ considered: 0 });
    expect(setup.translate).toHaveBeenCalledOnce();
    expect(setup.create).toHaveBeenCalledOnce();
    expect(setup.logJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', source: 'webhook:collection_item_published' }));
  } finally {
    clock.mockRestore();
    vi.unstubAllEnvs();
  }
});

it('asks Webflow to redeliver when the job could not be saved', async () => {
  vi.stubEnv('WEBFLOW_WEBHOOK_SECRET', 'fixture');
  setup.read.mockImplementation(async (_id, locale) => locale === dk ? item(danish, dk) : absent());
  setup.saveQueued.mockRejectedValueOnce(new Error('Firestore unavailable'));
  try {
    const response = await receiveWebflowPublish(publishDelivery());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ needsRetry: true, translationQueued: [], translationErrors: [id] });
    expect(setup.after).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});

it('resumes a confirmed English draft after a publish failure without calling the model again', async () => {
  let staged = false;
  let published = false;
  const saved: Record<string, unknown> = {};
  setup.readState.mockReturnValue(saved);
  setup.setState.mockImplementation(async patch => Object.assign(saved, patch));
  setup.read.mockImplementation(async (_id, locale, options) => locale === dk ? item(danish, dk) :
    options.live ? (published ? item(english, en) : absent()) : (staged ? item(english, en, published) : absent()));
  setup.create.mockImplementation(async () => { staged = true; });
  setup.publish.mockRejectedValueOnce(new Error('CMS timeout')).mockImplementationOnce(async () => { published = true; });
  await expect(runArticleTranslation(id)).rejects.toThrow('CMS timeout');
  await expect(runArticleTranslation(id)).resolves.toMatchObject({ skipped: false });
  expect(setup.translate).toHaveBeenCalledOnce();
  expect(setup.create).toHaveBeenCalledOnce();
});

it('does not publish after an editorial edit during the translation', async () => {
  let changed = false;
  setup.read.mockImplementation(async (_id, locale) => locale === dk ? item({ ...danish, name: changed ? 'Ændret' : danish.name }, dk) : absent());
  setup.translate.mockImplementation(async () => { changed = true; return english; });
  await expect(runArticleTranslation(id)).rejects.toThrow('ændret under');
  expect(setup.create).not.toHaveBeenCalled();
  expect(setup.publish).not.toHaveBeenCalled();
});
