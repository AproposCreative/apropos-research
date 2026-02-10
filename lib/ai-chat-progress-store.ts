/**
 * In-memory progress store for AI chat pipeline.
 * Used so the client can poll GET /api/ai-chat/progress?id=xxx and show real-time steps.
 */

export type ProgressStepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

export interface ProgressStep {
  id: string;
  label: string;
  status: ProgressStepStatus;
}

export interface ProgressState {
  steps: ProgressStep[];
  updatedAt: number;
  completed?: boolean;
}

const store = new Map<string, ProgressState>();

const TTL_MS = 10 * 60 * 1000; // 10 min

function prune() {
  const now = Date.now();
  for (const [id, state] of store.entries()) {
    if (now - state.updatedAt > TTL_MS) store.delete(id);
  }
}

export function initProgress(progressId: string, steps: { id: string; label: string }[]): void {
  if (!progressId) return;
  prune();
  store.set(progressId, {
    steps: steps.map((s) => ({ id: s.id, label: s.label, status: 'pending' as ProgressStepStatus })),
    updatedAt: Date.now(),
  });
}

export function updateProgressStep(
  progressId: string,
  stepId: string,
  status: ProgressStepStatus,
  _details?: unknown
): void {
  if (!progressId) return;
  const state = store.get(progressId);
  if (!state) return;
  const step = state.steps.find((s) => s.id === stepId);
  if (step) step.status = status;
  state.updatedAt = Date.now();
}

export function completeProgress(progressId: string): void {
  if (!progressId) return;
  const state = store.get(progressId);
  if (!state) return;
  state.steps.forEach((s) => {
    if (s.status === 'active') s.status = 'completed';
  });
  state.completed = true;
  state.updatedAt = Date.now();
}

export function getProgress(progressId: string): ProgressState | null {
  if (!progressId) return null;
  prune();
  return store.get(progressId) ?? null;
}
