import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readMetadataCases, compareMetadataSet } from '../lib/editorial/metadata-evaluation';

const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--candidates')) throw Error('Usage: npm run quality:metadata -- [--candidates saved.json]');
const root = process.cwd(), dir = path.join(root, 'tmp/editorial-metadata-eval'), cases = readMetadataCases(root);
const template = cases.map(row => ({ caseId: row.caseId, sourceHash: row.sourceHash, proposed: row.original }));
let candidates: unknown = template;
if (args.length) {
  if (statSync(args[1]).size > 256000) throw Error('metadata_candidate_file_too_large');
  candidates = JSON.parse(readFileSync(args[1], 'utf8'));
}
// Reject unknown rows/extra fields/version mismatches before invoking any CLI.
const report = compareMetadataSet(cases, candidates);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'candidate-template.json'), JSON.stringify(template, null, 2));
writeFileSync(path.join(dir, 'review-context.json'), JSON.stringify(cases, null, 2));
writeFileSync(path.join(dir, 'comparison.json'), JSON.stringify(report, null, 2));
writeFileSync(path.join(dir, 'outputs.json'), JSON.stringify((candidates as typeof template).map(row => ({ output: JSON.stringify(row), tags: [row.caseId, 'metadata-regression-not-holdout'] }))));
const require = createRequire(import.meta.url);
const run = spawnSync(process.execPath, ['--import', require.resolve('tsx'),
  path.join(root, 'tools/editorial-eval/node_modules/promptfoo/dist/src/entrypoint.js'), 'eval',
  '--assertions', '../../tools/editorial-eval/metadata-assertions.yaml', '--model-outputs', 'outputs.json',
  '--output', 'promptfoo-report.json', '--no-write', '--no-cache', '--no-table', '--no-share', '--no-progress-bar'], {
  cwd: dir, stdio: 'inherit', env: { PATH: process.env.PATH || '', PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: '1', PROMPTFOO_CONFIG_DIR: dir, PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: 'true' },
});
if (run.error) throw run.error;
console.log(JSON.stringify({ ...report, rows: undefined, artifacts: 'tmp/editorial-metadata-eval',
  mode: args.length ? 'saved-candidate-comparison' : 'unchanged-baseline', qualityGainMeasured: false }));
process.exitCode = run.status === null ? 1 : run.status || (report.regressionCases ? 1 : 0);
