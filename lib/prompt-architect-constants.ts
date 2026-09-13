/** localStorage: Record<segmentId, boolean> — false means module disabled for next ai-chat calls */
export const PROMPT_MODULE_TOGGLES_KEY = 'apropos-prompt-module-toggles';

/** sessionStorage: JSON { articleData, notes, authorTOV, authorName } for Prompt Architect preload */
export const PROMPT_ARCHITECT_CONTEXT_KEY = 'apropos-prompt-architect-context';

/** Legacy keys are never read as they have no proven owner. */
export function promptArchitectKey(base: string, uid: string) {
  if (!uid) throw new Error('prompt_owner_required');
  return `${base}:v2:${encodeURIComponent(uid)}`;
}
