// Dependency-free recovery checks. Does not import app configuration or load .env.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';

const tracked = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACM'], { encoding: 'utf8' }).trim().split('\n');
const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n');
let parsed = 0;
for (const file of new Set([...tracked, ...added])) {
  if (!file.endsWith('.ts') || !existsSync(file)) continue;
  stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'transform' });
  parsed++;
}
console.log(`TypeScript syntax: ${parsed} changed .ts files parsed (not TSX or type checking).`);

let imports = 0;
for (const file of new Set([...tracked, ...added])) {
  if (!/\.(ts|tsx)$/.test(file) || !existsSync(file)) continue;
  const code = readFileSync(file, 'utf8');
  for (const match of code.matchAll(/(?:from\s*|import\s*\()(['"])([@.][^'"]+)\1/g)) {
    const specifier = match[2];
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) continue;
    const target = specifier.startsWith('@/') ? specifier.slice(2) : path.join(path.dirname(file), specifier);
    assert.ok(['', '.ts', '.tsx', '.js', '.json', '/index.ts', '/index.tsx'].some(ext => existsSync(target + ext)), `${file}: missing import ${specifier}`);
    imports++;
  }
}
console.log(`Local import paths: ${imports} references in changed TS/TSX files resolved.`);

const source = stripTypeScriptTypes(readFileSync('lib/api/internal-auth.ts', 'utf8')).replace('export function', 'function');
function headers(env) {
  const context = vm.createContext({ process: { env }, Headers });
  return JSON.parse(vm.runInContext(`${source}\nJSON.stringify(internalApiHeaders())`, context));
}
assert.deepEqual(headers({}), { 'Content-Type': 'application/json' });
assert.equal(headers({ INTERNAL_API_SECRET: ' test-internal ', CRON_SECRET: 'test-cron' })['x-internal-api-secret'], 'test-internal');
assert.equal(headers({ CRON_SECRET: ' test-cron ' }).Authorization, 'Bearer test-cron');
assert.equal(headers({ CRON_SECRET: 'test-cron' })['x-internal-api-secret'], undefined);
console.log('Internal auth: four synthetic, isolated regression checks passed.');

const deployment = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert.ok(!deployment.crons.some(job => job.path.includes('funding')));
assert.ok(deployment.crons.some(job => job.path.includes('liv-daily-article')));
assert.ok(!existsSync('app/funding/page.tsx'));
assert.ok(!existsSync('app/api/cron/funding-weekly/route.ts'));
console.log('Funding removal: routes absent, cron removed, Liv cron preserved.');
