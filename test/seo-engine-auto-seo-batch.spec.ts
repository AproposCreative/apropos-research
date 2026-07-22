import { describe, expect, it, vi } from 'vitest';
import {
  exactPatchedFieldsMatch,
  previewAutoSeoBatch,
  runAutoSeoBatch,
  validateRunCandidateAgainstLive,
  type AutoSeoCandidate,
  type AutoSeoScanRecord,
} from '../lib/seo-engine/auto-seo-batch';
import { hashCmsContent } from '../lib/seo-engine/overwrite-backfill';

function listed(id: string, slug: string) {
  return {
    id,
    slug,
    title: slug,
    lastPublished: '2026-07-22T10:00:00.000Z',
    lastUpdated: '2026-07-22T10:00:00.000Z',
    isDraft: false,
  };
}

function liveItem(args: {
  id: string;
  name: string;
  content: string;
  lastUpdated: string;
  seoTitle?: string | null;
  meta?: string | null;
  lastPublished?: string | null;
}) {
  return {
    id: args.id,
    cmsLocaleId: 'dk',
    fieldData: {
      name: args.name,
      slug: args.id,
      content: args.content,
      'seo-title': args.seoTitle ?? null,
      'meta-description': args.meta ?? null,
    },
    lastUpdated: args.lastUpdated,
    lastPublished: args.lastPublished ?? '2026-07-22T10:00:00.000Z',
    isDraft: false,
  };
}

describe('auto-seo-batch Scan/Kør safety', () => {
  it('fetch errors do not count as missing_seo/ready', async () => {
    const scanStore = new Map<string, AutoSeoScanRecord>();
    const preview = await previewAutoSeoBatch(
      { limit: 5, userId: 'u1' },
      {
        scanStore,
        listFn: async () => [listed('a1', 'article-a'), listed('a2', 'article-b')],
        fetchFn: async (id) => {
          if (id === 'a1') throw new Error('network boom');
          return liveItem({
            id: 'a2',
            name: 'Ok',
            content: 'x'.repeat(250),
            lastUpdated: '2026-07-22T10:00:00.000Z',
            seoTitle: null,
            meta: null,
          }) as never;
        },
      }
    );
    expect(preview.fetchErrors).toBe(1);
    expect(preview.missingSeo).toBe(1);
    expect(preview.ready).toBe(1);
    expect(preview.candidates.some((c) => c.status === 'fetch_error')).toBe(false); // frozen only actionable
    // fetch_error is recorded but not in frozen actionable list — ready excludes it
    expect(preview.candidates.every((c) => c.status !== 'fetch_error')).toBe(true);
  });

  it('TOCTOU: filled after scan is skipped; content change is stale', async () => {
    const scanStore = new Map<string, AutoSeoScanRecord>();
    const lastUpdated = '2026-07-22T10:00:00.000Z';
    const content = 'body '.repeat(80);
    const emptyLive = liveItem({
      id: 'item1',
      name: 'Title',
      content,
      lastUpdated,
      seoTitle: null,
      meta: null,
    });
    const preview = await previewAutoSeoBatch(
      { userId: 'admin' },
      {
        scanStore,
        listFn: async () => [listed('item1', 'title')],
        fetchFn: async () => emptyLive as never,
      }
    );
    expect(preview.scanId).toBeTruthy();
    const cand = preview.candidates.find((c) => c.status === 'missing_seo')!;
    expect(cand).toBeTruthy();

    // Filled after scan
    const filledGate = validateRunCandidateAgainstLive({
      scanned: cand,
      liveLastUpdated: lastUpdated,
      liveContentHash: cand.contentHash,
      liveSeoTitleEmpty: false,
      liveMetaEmpty: false,
    });
    expect(filledGate.ok).toBe(false);
    if (!filledGate.ok) expect(filledGate.reason).toMatch(/udfyl/i);

    // Content changed
    const newHash = hashCmsContent({ name: 'Title', content: content + ' changed' });
    const staleGate = validateRunCandidateAgainstLive({
      scanned: cand,
      liveLastUpdated: lastUpdated,
      liveContentHash: newHash,
      liveSeoTitleEmpty: true,
      liveMetaEmpty: true,
    });
    expect(staleGate.ok).toBe(false);
    if (!staleGate.ok) expect(staleGate.reason).toMatch(/contentHash/i);

    // lastUpdated changed
    const luGate = validateRunCandidateAgainstLive({
      scanned: cand,
      liveLastUpdated: '2026-07-22T11:00:00.000Z',
      liveContentHash: cand.contentHash,
      liveSeoTitleEmpty: true,
      liveMetaEmpty: true,
    });
    expect(luGate.ok).toBe(false);
    if (!luGate.ok) expect(luGate.reason).toMatch(/lastUpdated/i);
  });

  it('Kør blocks without scan / with mismatched fingerprints; uses durable job path', async () => {
    const scanStore = new Map<string, AutoSeoScanRecord>();
    const lastUpdated = '2026-07-22T10:00:00.000Z';
    const content = 'body '.repeat(80);
    const emptyLive = liveItem({
      id: 'item2',
      name: 'Title2',
      content,
      lastUpdated,
      seoTitle: null,
      meta: null,
    });
    const preview = await previewAutoSeoBatch(
      { userId: 'admin' },
      {
        scanStore,
        listFn: async () => [listed('item2', 'title2')],
        fetchFn: async () => emptyLive as never,
      }
    );
    const cand = preview.candidates[0]!;

    const noScan = await runAutoSeoBatch(
      { scanId: '', candidates: [cand], userId: 'admin' },
      { scanStore }
    );
    expect(noScan.processed).toBe(0);
    expect(noScan.skippedReason).toMatch(/Scan/i);

    const badFp = await runAutoSeoBatch(
      {
        scanId: preview.scanId,
        candidates: [{ ...cand, contentHash: 'tampered' }],
        userId: 'admin',
      },
      {
        scanStore,
        fetchFn: async () => emptyLive as never,
      }
    );
    expect(badFp.succeeded).toBe(0);
    expect(badFp.results[0]?.reason).toMatch(/fingeraftryk|scan/i);

    const enqueueFn = vi.fn(async (args: { itemId: string; cmsLastUpdated: string }) => ({
      jobId: `${args.itemId}_${args.cmsLastUpdated}`,
      created: true,
    }));
    const runJobFn = vi.fn(async () => ({ ok: true as const, seoVersionId: 'v1' }));

    const okRun = await runAutoSeoBatch(
      {
        scanId: preview.scanId,
        candidates: [cand],
        userId: 'admin',
        articleLimit: 3,
      },
      {
        scanStore,
        fetchFn: async () => emptyLive as never,
        enqueueFn: enqueueFn as never,
        runJobFn: runJobFn as never,
      }
    );
    expect(enqueueFn).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item2',
        cmsLastUpdated: lastUpdated,
        source: 'manual',
      })
    );
    expect(runJobFn).toHaveBeenCalled();
    expect(okRun.succeeded).toBe(1);
  });

  it('exactPatchedFieldsMatch requires exact values not merely non-empty', () => {
    expect(
      exactPatchedFieldsMatch({
        expected: { seoTitle: 'Lucky anmeldelse' },
        liveSeoTitle: 'Lucky anmeldelse',
        liveMetaDescription: null,
      })
    ).toBe(true);
    expect(
      exactPatchedFieldsMatch({
        expected: { seoTitle: 'Lucky anmeldelse' },
        liveSeoTitle: 'Something else entirely',
        liveMetaDescription: null,
      })
    ).toBe(false);
  });

  it('publish-only-if-published invariant documented via candidate live lastPublished gate', () => {
    // Worker publishes only when fresh.lastPublished is set — unit-covered in worker helpers.
    // Here we ensure unpublished scan candidates are not runnable missing_seo.
    const scanned: AutoSeoCandidate = {
      id: 'x',
      slug: 'x',
      title: 'x',
      status: 'unpublished',
      seoTitleEmpty: true,
      metaDescriptionEmpty: true,
      lastUpdated: 't',
      contentHash: 'h',
      inputVersionHash: 'i',
    };
    const gate = validateRunCandidateAgainstLive({
      scanned,
      liveLastUpdated: 't',
      liveContentHash: 'h',
      liveSeoTitleEmpty: true,
      liveMetaEmpty: true,
    });
    expect(gate.ok).toBe(false);
  });
});
