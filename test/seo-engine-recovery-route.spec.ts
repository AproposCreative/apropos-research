import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const background = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<void>> }));
vi.mock('next/server', async () => ({ ...await vi.importActual<typeof import('next/server')>('next/server'),
  after: (task: () => Promise<void>) => background.tasks.push(task) }));
vi.mock('@/lib/seo-engine/post-publish/jobs', () => ({ listRecoverableQualityJobs: vi.fn(async () => ['quality-job']) }));
vi.mock('@/lib/seo-engine/post-publish/runtime', () => ({ runProductionQualityJob: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/seo-engine/post-publish/discovery', () => ({ discoverPublishedQualityJobs: vi.fn(async () => ({ skipped: false })) }));
vi.mock('@/lib/seo-engine/settings', () => ({ resolveAutoSeoEngineEnabled: vi.fn(async () => false) }));
vi.mock('@/lib/seo-engine/opportunity-engine/settings', () => ({ resolveAutomaticOpportunityRuntime: vi.fn(async () => ({ killSwitchEnabled: true, shouldAutoFillOnPublish: true })) }));
vi.mock('@/lib/seo-engine/jobs', () => ({ listQueuedSeoEngineJobs: vi.fn(async () => [
  { jobId: 'original-english-job', itemId: 'item', locale: 'en' },
  { jobId: 'original-danish-job', itemId: 'item', locale: 'da' },
]) }));
vi.mock('@/lib/seo-engine/enqueue', () => ({ kickSeoEngineJob: vi.fn() }));
vi.mock('@/lib/seo-engine/secret-guards', () => ({ requireCronSecret: vi.fn(() => true) }));
import { GET } from '../app/api/cron/seo-engine-recovery/route';
import { kickSeoEngineJob } from '../lib/seo-engine/enqueue';
import { resolveAutoSeoEngineEnabled } from '../lib/seo-engine/settings';
import { resolveAutomaticOpportunityRuntime } from '../lib/seo-engine/opportunity-engine/settings';
beforeEach(() => { vi.clearAllMocks(); background.tasks = []; });
it('recovers exact EN and DA ids when only opportunity mode is enabled', async () => {
  const result = await GET(new NextRequest('http://localhost/api/cron/seo-engine-recovery'));
  expect(await result.json()).toMatchObject({ kicked: 2, jobIds: ['original-english-job', 'original-danish-job'] });
  expect(kickSeoEngineJob).toHaveBeenNthCalledWith(1, { itemId: 'item', jobId: 'original-english-job' });
  expect(kickSeoEngineJob).toHaveBeenNthCalledWith(2, { itemId: 'item', jobId: 'original-danish-job' });
});
it('does not start legacy writes while stopped, retaining quality readback recovery', async () => {
  vi.mocked(resolveAutoSeoEngineEnabled).mockResolvedValueOnce(true);
  vi.mocked(resolveAutomaticOpportunityRuntime).mockResolvedValueOnce({ killSwitchEnabled: false, shouldAutoFillOnPublish: false } as any);
  expect(await (await GET(new NextRequest('http://localhost/api/cron/seo-engine-recovery'))).json()).toMatchObject({ skipped: true });
  expect(kickSeoEngineJob).not.toHaveBeenCalled();
  expect(background.tasks).toHaveLength(1);
  await background.tasks[0]();
});
