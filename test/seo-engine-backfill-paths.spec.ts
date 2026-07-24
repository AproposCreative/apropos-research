import { describe, expect, it, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ensureSeoEngineBackfillDir,
  isSeoEngineServerlessFs,
  resolveSeoEngineBackfillDir,
} from '../lib/seo-engine/backfill-paths';

describe('seo-engine backfill paths (serverless FS)', () => {
  const keys = ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'LAMBDA_TASK_ROOT'] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
      delete saved[k];
    }
  });

  function snapEnv() {
    for (const k of keys) saved[k] = process.env[k];
    for (const k of keys) delete process.env[k];
  }

  it('uses os.tmpdir when VERCEL=1', () => {
    snapEnv();
    process.env.VERCEL = '1';
    expect(isSeoEngineServerlessFs()).toBe(true);
    const dir = resolveSeoEngineBackfillDir();
    expect(dir).toBe(join(tmpdir(), 'seo-engine-backfill'));
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(dir.includes(`${join('var', 'task')}`)).toBe(false);
  });

  it('uses repo tmp locally when not serverless', () => {
    snapEnv();
    const dir = resolveSeoEngineBackfillDir({ cwd: '/repo/root', forceServerless: false });
    expect(dir).toBe(join('/repo/root', 'tmp', 'seo-engine-backfill'));
  });

  it('ensureSeoEngineBackfillDir creates serverless dir', () => {
    snapEnv();
    process.env.VERCEL = '1';
    const dir = ensureSeoEngineBackfillDir({ forceServerless: true });
    expect(dir).toBe(join(tmpdir(), 'seo-engine-backfill'));
  });

  it('honors explicit reportDir override', () => {
    snapEnv();
    process.env.VERCEL = '1';
    const custom = join(tmpdir(), 'custom-bf-test');
    expect(ensureSeoEngineBackfillDir({ reportDir: custom })).toBe(custom);
  });
});
