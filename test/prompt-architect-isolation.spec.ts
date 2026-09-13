import { afterEach, expect, it, vi } from 'vitest';
import { promptArchitectKey, PROMPT_ARCHITECT_CONTEXT_KEY, PROMPT_MODULE_TOGGLES_KEY } from '@/lib/prompt-architect-constants';
import { loadPromptModuleToggles, savePromptModuleToggles } from '@/lib/prompt-architect-storage';
afterEach(() => vi.unstubAllGlobals());
it('has distinct owner keys even for punctuation and refuses absent owners', () => {
  expect(promptArchitectKey(PROMPT_ARCHITECT_CONTEXT_KEY, 'a/b')).not.toBe(promptArchitectKey(PROMPT_ARCHITECT_CONTEXT_KEY, 'a%2Fb'));
  expect(() => promptArchitectKey(PROMPT_ARCHITECT_CONTEXT_KEY, '')).toThrow();
});
it('ignores legacy preferences and isolates each account on the same browser', () => {
  const values = new Map([[PROMPT_MODULE_TOGGLES_KEY, '{"private":false}']]);
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string,v: string) => values.set(k,v) });
  expect(loadPromptModuleToggles('frederik')).toEqual({});
  savePromptModuleToggles({style:false},'frederik');
  expect(loadPromptModuleToggles('milo')).toEqual({});
  expect(loadPromptModuleToggles('frederik')).toEqual({style:false});
  expect(values.has(PROMPT_MODULE_TOGGLES_KEY)).toBe(true);
});
