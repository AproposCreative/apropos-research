/**
 * Writable directory for SEO overwrite/apply backups + reports.
 * On Vercel/Lambda the repo is read-only (`/var/task`); only os.tmpdir() is writable.
 * Local CLI keeps repo-relative `tmp/seo-engine-backfill` for easy inspection.
 */

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** True on Vercel serverless / AWS Lambda (read-only deployment FS). */
export function isSeoEngineServerlessFs(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
  );
}

/**
 * Default backfill/report directory.
 * Serverless → `{os.tmpdir()}/seo-engine-backfill`
 * Local → `{cwd}/tmp/seo-engine-backfill`
 */
export function resolveSeoEngineBackfillDir(opts?: {
  cwd?: string;
  forceServerless?: boolean;
}): string {
  const serverless =
    opts?.forceServerless === true ||
    (opts?.forceServerless !== false && isSeoEngineServerlessFs());
  if (serverless) {
    return join(tmpdir(), 'seo-engine-backfill');
  }
  const root = opts?.cwd || process.cwd();
  return join(root, 'tmp', 'seo-engine-backfill');
}

/** Resolve + ensure directory exists. */
export function ensureSeoEngineBackfillDir(opts?: {
  cwd?: string;
  forceServerless?: boolean;
  reportDir?: string | null;
}): string {
  const dir = opts?.reportDir?.trim()
    ? opts.reportDir.trim()
    : resolveSeoEngineBackfillDir(opts);
  mkdirSync(dir, { recursive: true });
  return dir;
}
