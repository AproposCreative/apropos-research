/** Derived scheduling field. No article/body/model data is needed for selection. */
export function qualityPriorityReadyAt(job: { source?: string; writeStartedAt?: string; readyAt?: number; status?: string }): number | null {
  if (['kept', 'applied', 'needs_editor', 'stale', 'failed'].includes(job.status || '') ||
    !Number.isFinite(job.readyAt) || Number(job.readyAt) < 0) return null;
  return job.writeStartedAt || ['publish_app', 'webhook'].includes(job.source || '') ? Number(job.readyAt) : null;
}
