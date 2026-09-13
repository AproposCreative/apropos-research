import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('../app/ai/liv/LivBudgetSettings.tsx', import.meta.url), 'utf8');
it('loads only the authenticated read-only cost endpoint, not preparation or the article feed', () => {
  expect(source).toContain("fetch('/api/ai-cost/summary'");
  expect(source).toContain('Authorization: `Bearer ${token}`');
  expect(source).not.toContain('/api/liv/delivery/feed');
  expect(source).not.toContain("method: 'POST'");
});
it('discloses partial estimates and activation instead of promising account-wide billing coverage', () => {
  expect(source).toContain('Liv, Writer og SEO · API-budget');
  expect(source).toContain("cost.sharedActivation !== 'enabled'");
  expect(source).toContain('Historisk, umålt forbrug');
  expect(source).toContain('ikke API-udbyderens faktura');
});
