/**
 * Arkiv impact-kø: jobs with narrow finding-tasks + verified lifecycle.
 * Success = planned tasks resolved (CMS re-fetch), not “whole article P0-free”.
 */

export const ARCHIVE_JOBS_COL = 'seoEngineArchiveJobs';
export const ARCHIVE_JOBS_SCHEMA = 1;

export type ArchiveJobTaskKind =
  | 'seo_meta'
  | 'canonical'
  | 'image_alt'
  | 'headings'
  | 'internal_links';

export type ArchiveJobStatus =
  | 'open'
  | 'fixing'
  | 'verified'
  | 'partial'
  | 'failed'
  | 'dismissed';

export type ArchiveJobTaskStatus =
  | 'open'
  | 'planned'
  | 'applied'
  | 'verified'
  | 'failed'
  | 'skipped';

export type ArchiveJobTab = 'open' | 'running' | 'done';

export type ArchiveJobTask = {
  kind: ArchiveJobTaskKind;
  status: ArchiveJobTaskStatus;
  findingCodes: string[];
  label: string;
  error?: string | null;
  appliedAt?: string | null;
  verifiedAt?: string | null;
};

export type ArchiveJob = {
  schemaVersion: number;
  jobId: string;
  itemId: string;
  locale: 'da' | 'en';
  title: string;
  slug: string;
  seoTitle: string;
  articleTypeHint: string;
  status: ArchiveJobStatus;
  tasks: ArchiveJobTask[];
  /** GSC/GA4 one-liner — «hvorfor i kø» */
  whyInQueue: string;
  impactScore: number;
  priorityHint: 'P0' | 'P1' | 'P2' | 'ok';
  gscClicks: number | null;
  ga4PageViews: number | null;
  scanFindingCodes: string[];
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
  lastPreview?: {
    kinds: ArchiveJobTaskKind[];
    seoTitle?: string;
    metaDescription?: string;
    summary: string;
  } | null;
};

export const ARCHIVE_JOB_TASK_LABELS: Record<ArchiveJobTaskKind, string> = {
  seo_meta: 'SEO-title + meta',
  canonical: 'Canonical',
  image_alt: 'Billede-alt',
  headings: 'Overskrifter',
  internal_links: 'Interne links',
};

/** Finding codes that map onto a fix-task. */
export const FINDING_TO_TASK: Partial<Record<string, ArchiveJobTaskKind>> = {
  missing_seo_title: 'seo_meta',
  missing_meta_description: 'seo_meta',
  weak_seo_title: 'seo_meta',
  short_meta: 'seo_meta',
  review_title_keyword_missing: 'seo_meta',
  missing_explicit_canonical: 'canonical',
  missing_image_alt: 'image_alt',
  weak_heading_structure: 'headings',
  few_internal_links: 'internal_links',
};

const CONTENT_KINDS: ArchiveJobTaskKind[] = [
  'canonical',
  'image_alt',
  'headings',
  'internal_links',
];

export function buildArchiveJobId(itemId: string, locale: string): string {
  return `${itemId}_${locale}`;
}

export function isEnFetchNoise(row: {
  locale?: string;
  findings?: Array<{ code?: string; message?: string }>;
  siblingLocalePresent?: boolean | null;
}): boolean {
  if (row.locale !== 'en') return false;
  if (row.siblingLocalePresent === false) return true;
  const findings = row.findings || [];
  if (findings.some((f) => f.code === 'fetch_error')) return true;
  if (findings.some((f) => /mangler|not found|404/i.test(String(f.message || '')))) {
    return true;
  }
  return false;
}

/** Skip noise from default queue (EN 404 / fetch_error-only / unpublished). */
export function shouldSkipRowForDefaultQueue(row: {
  locale?: string;
  findings?: Array<{ code?: string; message?: string }>;
  siblingLocalePresent?: boolean | null;
}): boolean {
  if (isEnFetchNoise(row)) return true;
  const codes = new Set((row.findings || []).map((f) => String(f.code || '')));
  if (codes.has('unpublished')) return true;
  if (codes.has('fetch_error') && ![...codes].some((c) => FINDING_TO_TASK[c])) {
    return true;
  }
  return false;
}

export function taskKindsFromFindings(
  findings: Array<{ code?: string }>
): Map<ArchiveJobTaskKind, string[]> {
  const map = new Map<ArchiveJobTaskKind, string[]>();
  for (const f of findings) {
    const code = String(f.code || '');
    const kind = FINDING_TO_TASK[code];
    if (!kind) continue;
    const list = map.get(kind) || [];
    list.push(code);
    map.set(kind, list);
  }
  return map;
}

export function openTaskKinds(tasks: ArchiveJobTask[]): ArchiveJobTaskKind[] {
  return tasks
    .filter((t) => t.status === 'open' || t.status === 'planned' || t.status === 'failed')
    .map((t) => t.kind);
}

export function contentOpenCount(tasks: ArchiveJobTask[]): number {
  return tasks.filter(
    (t) =>
      CONTENT_KINDS.includes(t.kind) &&
      (t.status === 'open' || t.status === 'planned' || t.status === 'failed')
  ).length;
}

export function seoMetaTask(tasks: ArchiveJobTask[]): ArchiveJobTask | undefined {
  return tasks.find((t) => t.kind === 'seo_meta');
}

/**
 * Derive lifecycle from tasks.
 * After seo_meta verified with remaining content → partial (never “Kritisk” alone).
 */
export function deriveJobStatus(tasks: ArchiveJobTask[]): ArchiveJobStatus {
  if (!tasks.length) return 'verified';
  if (tasks.some((t) => t.status === 'planned' || t.status === 'applied')) {
    return 'fixing';
  }
  const actionable = tasks.filter((t) => t.status !== 'skipped');
  const failed = actionable.filter((t) => t.status === 'failed');
  const open = actionable.filter((t) => t.status === 'open');
  const verified = actionable.filter((t) => t.status === 'verified');

  if (failed.length && !open.length && verified.length === 0) return 'failed';
  if (failed.length && (open.length || verified.length)) return 'partial';
  if (open.length === 0 && verified.length === actionable.length) return 'verified';
  if (verified.length > 0 && open.length > 0) return 'partial';
  if (open.length > 0) return 'open';
  return 'verified';
}

/** UI badge — never show bare «Kritisk» when only content findings remain after meta. */
export function jobStatusBadge(job: Pick<ArchiveJob, 'status' | 'tasks'>): {
  label: string;
  tone: 'ok' | 'warn' | 'err' | 'idle' | 'run';
} {
  const status = job.status === 'dismissed' ? 'dismissed' : deriveJobStatus(job.tasks);
  const meta = seoMetaTask(job.tasks);
  const contentOpen = contentOpenCount(job.tasks);
  const metaDone =
    meta && (meta.status === 'verified' || meta.status === 'applied' || meta.status === 'skipped');

  if (status === 'fixing') return { label: 'Kører', tone: 'run' };
  if (status === 'verified') return { label: 'Løst', tone: 'ok' };
  if (status === 'failed') return { label: 'Fejlet', tone: 'err' };
  if (status === 'dismissed') return { label: 'Afvist', tone: 'idle' };

  if (status === 'partial' || (metaDone && contentOpen > 0)) {
    if (metaDone && contentOpen > 0) {
      return {
        label: `Meta OK · ${contentOpen} åbne content`,
        tone: 'warn',
      };
    }
    return { label: 'Delvist løst', tone: 'warn' };
  }

  const openKinds = openTaskKinds(job.tasks);
  if (openKinds.length === 1 && openKinds[0] === 'seo_meta') {
    return { label: 'Mangler meta', tone: 'err' };
  }
  if (openKinds.includes('seo_meta')) {
    return { label: 'Åben · meta + content', tone: 'err' };
  }
  return { label: openKinds.length ? `Åben · ${openKinds.length} tasks` : 'Åben', tone: 'idle' };
}

export function tabForJob(status: ArchiveJobStatus): ArchiveJobTab {
  if (status === 'fixing') return 'running';
  if (status === 'verified' || status === 'dismissed') return 'done';
  if (status === 'partial' || status === 'failed' || status === 'open') {
    // partial stays in Åbne so user can finish content; failed too for retry
    return status === 'partial' || status === 'failed' || status === 'open' ? 'open' : 'done';
  }
  return 'open';
}

/** partial also listed under done when user filters “Løst” for history — primary tab is open until verified. */
export function jobMatchesTab(job: ArchiveJob, tab: ArchiveJobTab): boolean {
  if (job.status === 'dismissed') return tab === 'done';
  const status = deriveJobStatus(job.tasks);
  if (tab === 'running') return status === 'fixing' || job.status === 'fixing';
  if (tab === 'done') return status === 'verified';
  // open: open + partial + failed (actionable)
  return status === 'open' || status === 'partial' || status === 'failed';
}

export function whyInQueueLine(row: {
  gscPageMatched?: boolean;
  gscClicks?: number | null;
  gscTopQuery?: string | null;
  ga4PageMatched?: boolean;
  ga4PageViews?: number | null;
  priority?: string;
  winClass?: string;
}): string {
  const parts: string[] = [];
  if (row.gscPageMatched && (row.gscClicks || 0) > 0) {
    parts.push(`SC ${row.gscClicks} klik${row.gscTopQuery ? ` · ${row.gscTopQuery}` : ''}`);
  }
  if (row.ga4PageMatched && (row.ga4PageViews || 0) > 0) {
    parts.push(`GA4 ${row.ga4PageViews} visninger`);
  }
  if (!parts.length) {
    if (row.winClass === 'quick_win') return 'Hurtig gevinst — lav risiko';
    if (row.priority === 'P0') return 'Kritisk SEO-fund';
    return 'Fundet ved arkiv-scan';
  }
  return parts.join(' · ');
}

export function impactScoreFromRow(row: {
  priority?: string;
  gscClicks?: number | null;
  ga4PageViews?: number | null;
  winClass?: string;
}): number {
  let score = 0;
  if (row.priority === 'P0') score += 1000;
  else if (row.priority === 'P1') score += 500;
  else if (row.priority === 'P2') score += 100;
  score += Math.min(400, (row.gscClicks || 0) * 4);
  score += Math.min(200, Math.floor((row.ga4PageViews || 0) / 10));
  if (row.winClass === 'quick_win') score += 50;
  return score;
}

export function buildArchiveJobFromRow(row: {
  itemId: string;
  locale: string;
  title?: string;
  slug?: string;
  seoTitle?: string;
  articleTypeHint?: string;
  priority?: string;
  winClass?: string;
  findings?: Array<{ code?: string; message?: string }>;
  gscPageMatched?: boolean;
  gscClicks?: number | null;
  gscTopQuery?: string | null;
  ga4PageMatched?: boolean;
  ga4PageViews?: number | null;
  siblingLocalePresent?: boolean | null;
}): ArchiveJob | null {
  if (shouldSkipRowForDefaultQueue(row)) return null;
  const kindMap = taskKindsFromFindings(row.findings || []);
  if (kindMap.size === 0) return null;

  const locale = row.locale === 'en' ? 'en' : 'da';
  const now = new Date().toISOString();
  const tasks: ArchiveJobTask[] = [...kindMap.entries()].map(([kind, codes]) => ({
    kind,
    status: 'open' as const,
    findingCodes: codes,
    label: ARCHIVE_JOB_TASK_LABELS[kind],
    error: null,
  }));

  // Stable task order
  const order: ArchiveJobTaskKind[] = [
    'seo_meta',
    'canonical',
    'image_alt',
    'headings',
    'internal_links',
  ];
  tasks.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  const job: ArchiveJob = {
    schemaVersion: ARCHIVE_JOBS_SCHEMA,
    jobId: buildArchiveJobId(row.itemId, locale),
    itemId: row.itemId,
    locale,
    title: String(row.title || row.slug || row.itemId),
    slug: String(row.slug || ''),
    seoTitle: String(row.seoTitle || ''),
    articleTypeHint: String(row.articleTypeHint || ''),
    status: 'open',
    tasks,
    whyInQueue: whyInQueueLine(row),
    impactScore: impactScoreFromRow(row),
    priorityHint:
      row.priority === 'P0' || row.priority === 'P1' || row.priority === 'P2' || row.priority === 'ok'
        ? row.priority
        : 'P2',
    gscClicks: row.gscClicks ?? null,
    ga4PageViews: row.ga4PageViews ?? null,
    scanFindingCodes: (row.findings || []).map((f) => String(f.code || '')).filter(Boolean),
    createdAt: now,
    updatedAt: now,
    lastError: null,
    lastPreview: null,
  };
  job.status = deriveJobStatus(job.tasks);
  return job;
}

export function buildArchiveJobsFromRows(
  rows: Array<Parameters<typeof buildArchiveJobFromRow>[0]>
): { jobs: ArchiveJob[]; skipped: number } {
  const jobs: ArchiveJob[] = [];
  let skipped = 0;
  for (const row of rows) {
    const job = buildArchiveJobFromRow(row);
    if (!job) {
      skipped += 1;
      continue;
    }
    jobs.push(job);
  }
  jobs.sort((a, b) => b.impactScore - a.impactScore);
  return { jobs, skipped };
}

/**
 * After CMS re-fetch findings: mark planned/applied tasks verified or reopen.
 * Only evaluates kinds that were in `plannedKinds` (success ≠ whole article clean).
 */
export function applyVerifyToJob(
  job: ArchiveJob,
  args: {
    plannedKinds: ArchiveJobTaskKind[];
    liveFindings: Array<{ code?: string }>;
    liveSeoTitle?: string;
  }
): ArchiveJob {
  const remaining = taskKindsFromFindings(args.liveFindings);
  const now = new Date().toISOString();
  const tasks = job.tasks.map((t) => {
    if (!args.plannedKinds.includes(t.kind)) return t;
    if (remaining.has(t.kind)) {
      return {
        ...t,
        status: 'open' as const,
        findingCodes: remaining.get(t.kind) || t.findingCodes,
        error: 'Stadig fund efter skrivning',
        verifiedAt: null,
      };
    }
    return {
      ...t,
      status: 'verified' as const,
      error: null,
      verifiedAt: now,
      findingCodes: [],
    };
  });
  const next: ArchiveJob = {
    ...job,
    tasks,
    seoTitle: args.liveSeoTitle ?? job.seoTitle,
    updatedAt: now,
    lastError: null,
  };
  next.status = deriveJobStatus(tasks);
  return next;
}

export function markTasksApplied(
  job: ArchiveJob,
  kinds: ArchiveJobTaskKind[]
): ArchiveJob {
  const now = new Date().toISOString();
  const set = new Set(kinds);
  const tasks = job.tasks.map((t) =>
    set.has(t.kind)
      ? { ...t, status: 'applied' as const, appliedAt: now, error: null }
      : t
  );
  return {
    ...job,
    tasks,
    status: 'fixing',
    updatedAt: now,
  };
}

export function markTasksFailed(
  job: ArchiveJob,
  kinds: ArchiveJobTaskKind[],
  error: string
): ArchiveJob {
  const set = new Set(kinds);
  const tasks = job.tasks.map((t) =>
    set.has(t.kind) ? { ...t, status: 'failed' as const, error } : t
  );
  const next = { ...job, tasks, lastError: error, updatedAt: new Date().toISOString() };
  next.status = deriveJobStatus(tasks);
  return next;
}

export function resolvePreviewKinds(
  job: ArchiveJob,
  requested?: ArchiveJobTaskKind[] | null
): ArchiveJobTaskKind[] {
  const open = openTaskKinds(job.tasks);
  if (!requested?.length) {
    // Default Løs: seo_meta first if open, else all open content
    if (open.includes('seo_meta')) return ['seo_meta'];
    return open;
  }
  return requested.filter((k) => open.includes(k));
}
