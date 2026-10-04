import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps offline document experiments out of the app install and deployment', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(Object.keys(pkg.dependencies)).not.toEqual(expect.arrayContaining(['docling']));
  expect(Object.keys(pkg.scripts).some(key => /document-eval/.test(String(pkg.scripts[key])))).toBe(false);
  expect(readFileSync('.vercelignore', 'utf8').split('\n')).toContain('tools/document-eval');
  expect(readFileSync('next.config.mjs', 'utf8')).toContain("'./tools/document-eval/**/*'");
});

it('locks test-only wheels by exact version and hash, without model packages', () => {
  const rows = readFileSync('tools/document-eval/requirements-macos-arm64-py312.txt', 'utf8')
    .split('\n').filter(line => line && !line.startsWith('#'));
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row).toMatch(/^[\w.-]+==[\w.]+ --hash=sha256:[a-f0-9]{64}$/);
  expect(rows.some(row => /^(openai|anthropic|torch|transformers|docling-ibm-models)==/.test(row))).toBe(false);
});
