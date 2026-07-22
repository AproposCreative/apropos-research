import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SEO_ENGINE_PROMPT_VERSION } from '@/lib/seo-engine/versions';

const ROOT = path.join(process.cwd(), 'prompts', 'seo-engine');

const cache = new Map<string, string>();

function readCached(rel: string): string {
  const hit = cache.get(rel);
  if (hit !== undefined) return hit;
  const abs = path.join(ROOT, rel);
  const text = readFileSync(abs, 'utf8');
  cache.set(rel, text);
  return text;
}

export type SeoEnginePromptId =
  | '00-system-policy'
  | '01-analyze'
  | '02-strategize'
  | '03-regenerate-field'
  | '04-jsonld-notes'
  | '05-validator-notes'
  | '06-editor-instructions';

const PROMPT_FILES: Record<SeoEnginePromptId, string> = {
  '00-system-policy': '00-system-policy.md',
  '01-analyze': '01-analyze.md',
  '02-strategize': '02-strategize.md',
  '03-regenerate-field': '03-regenerate-field.md',
  '04-jsonld-notes': '04-jsonld-notes.md',
  '05-validator-notes': '05-validator-notes.md',
  '06-editor-instructions': '06-editor-instructions.md',
};

export function loadSeoEnginePrompt(id: SeoEnginePromptId): string {
  return readCached(PROMPT_FILES[id]);
}

export function loadEditorialAnalysisJsonSchema(): Record<string, unknown> {
  return JSON.parse(readCached(path.join('schemas', 'editorial-analysis-v1.json')));
}

export function loadSeoStrategyPackJsonSchema(): Record<string, unknown> {
  return JSON.parse(readCached(path.join('schemas', 'seo-strategy-pack-v1.json')));
}

/** System message: policy + phase prompt + notes. Never put article body here. */
export function buildAnalyzeSystemPrompt(): string {
  return [
    loadSeoEnginePrompt('00-system-policy'),
    '',
    loadSeoEnginePrompt('01-analyze'),
    '',
    `PROMPT_VERSION=${SEO_ENGINE_PROMPT_VERSION}`,
  ].join('\n');
}

export function buildStrategizeSystemPrompt(): string {
  return [
    loadSeoEnginePrompt('00-system-policy'),
    '',
    loadSeoEnginePrompt('02-strategize'),
    '',
    loadSeoEnginePrompt('04-jsonld-notes'),
    '',
    loadSeoEnginePrompt('05-validator-notes'),
    '',
    `PROMPT_VERSION=${SEO_ENGINE_PROMPT_VERSION}`,
  ].join('\n');
}

export function buildRegenerateSystemPrompt(): string {
  return [
    loadSeoEnginePrompt('00-system-policy'),
    '',
    loadSeoEnginePrompt('03-regenerate-field'),
    '',
    loadSeoEnginePrompt('06-editor-instructions'),
    '',
    `PROMPT_VERSION=${SEO_ENGINE_PROMPT_VERSION}`,
  ].join('\n');
}

/** Test helper — clears module cache between tests if needed. */
export function clearSeoEnginePromptCache(): void {
  cache.clear();
}

export function listSeoEnginePromptIds(): SeoEnginePromptId[] {
  return Object.keys(PROMPT_FILES) as SeoEnginePromptId[];
}
