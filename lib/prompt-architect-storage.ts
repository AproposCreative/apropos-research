import { PROMPT_MODULE_TOGGLES_KEY, promptArchitectKey } from '@/lib/prompt-architect-constants';

export function loadPromptModuleToggles(uid: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(promptArchitectKey(PROMPT_MODULE_TOGGLES_KEY, uid));
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function savePromptModuleToggles(t: Record<string, boolean>, uid: string) {
  try {
    localStorage.setItem(promptArchitectKey(PROMPT_MODULE_TOGGLES_KEY, uid), JSON.stringify(t));
  } catch {
    /* ignore */
  }
}
