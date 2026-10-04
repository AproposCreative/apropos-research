import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readCalibrationCases } from '../lib/editorial/calibration-cases';
import { qualityTextHash } from '../lib/editorial/quality-evaluation';

// Fixed local output and fixed deterministic assertions. No caller-supplied
// providers/config, .env files, inherited API credentials or model-grade steps.
const root = process.cwd(), dir = path.join(root, 'tmp/editorial-offline-eval');
mkdirSync(dir, { recursive: true });
const outputs = readCalibrationCases().map(article => ({
  output: JSON.stringify({ id: article.id, title: article.title, intro: article.intro, bodyText: article.bodyText,
    textHash: qualityTextHash(article), humanScores: null, publicationApproval: false }),
  tags: [article.id, article.kind, 'saved-calibration-not-holdout'],
}));
writeFileSync(path.join(dir, 'outputs.json'), JSON.stringify(outputs));
const result = spawnSync(process.execPath, [path.join(root, 'tools/editorial-eval/node_modules/promptfoo/dist/src/entrypoint.js'),
  'eval', '--assertions', path.relative(dir, path.join(root, 'tools/editorial-eval/assertions.yaml')), '--model-outputs', 'outputs.json',
  '--output', 'report.json', '--no-write', '--no-cache', '--no-table', '--no-share', '--no-progress-bar'], {
  cwd: dir, stdio: 'inherit', env: { PATH: process.env.PATH || '',
    PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1', PROMPTFOO_CONFIG_DIR: dir,
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true', PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'true' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
