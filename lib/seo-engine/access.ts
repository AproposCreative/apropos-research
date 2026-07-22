/**
 * Studio admin / allowlist for SEO Engine.
 *
 * Production: membership in SEO_ENGINE_ADMIN_UIDS OR SEO_ENGINE_ALLOWED_UIDS is required.
 * Local/non-prod: open when both lists are empty (developer convenience).
 * Admin membership in ADMIN_UIDS alone is enough (no need to also be on ALLOWED).
 */

function parseUidList(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isSeoEngineAdmin(uid: string): boolean {
  return parseUidList(process.env.SEO_ENGINE_ADMIN_UIDS).has(uid);
}

/**
 * Gate for all SEO Engine UI APIs.
 * - Prod: must be in ADMIN or ALLOWED list (fail closed if both empty).
 * - Non-prod: allow everyone when lists empty; otherwise require membership.
 */
export function isSeoEngineUidAllowed(uid: string): boolean {
  const admins = parseUidList(process.env.SEO_ENGINE_ADMIN_UIDS);
  const allowed = parseUidList(process.env.SEO_ENGINE_ALLOWED_UIDS);
  if (admins.has(uid) || allowed.has(uid)) return true;
  if (admins.size === 0 && allowed.size === 0) {
    return !isProductionRuntime();
  }
  return false;
}

/**
 * Owner/admin ACL.
 * system:* documents are admin-only — never readable/writable by arbitrary auth users.
 */
export function assertCanAccessOwnedDoc(args: {
  userId: string;
  createdBy?: string | null;
}): void {
  if (!args.createdBy) {
    throw Object.assign(new Error('Dokument mangler ejer'), { code: 'forbidden' });
  }
  if (args.createdBy.startsWith('system:')) {
    if (isSeoEngineAdmin(args.userId)) return;
    throw Object.assign(new Error('System-dokumenter kræver admin'), { code: 'forbidden' });
  }
  if (args.createdBy === args.userId) return;
  if (isSeoEngineAdmin(args.userId)) return;
  throw Object.assign(new Error('Ingen adgang til dette dokument'), { code: 'forbidden' });
}

export function resolveStableArticleKey(args: {
  articleKey?: string | null;
  webflowItemId?: string | null;
  inputVersionHash: string;
}): string {
  const explicit = String(args.articleKey || '').trim();
  if (explicit.startsWith('wf:') || explicit.startsWith('draft:')) return explicit;
  const wf = String(args.webflowItemId || '').trim();
  if (wf) return `wf:${wf}`;
  if (explicit) return explicit;
  return `draft:${args.inputVersionHash}`;
}

/** Truncated debug payload — never include article body / prompts. */
export function safeAiDebug(err: unknown): { code?: string; message: string; details?: unknown } {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  const details = (err as { details?: unknown })?.details;
  let safeDetails: unknown = undefined;
  if (details && typeof details === 'object') {
    try {
      const raw = JSON.stringify(details);
      safeDetails = JSON.parse(raw.length > 2000 ? raw.slice(0, 2000) : raw);
    } catch {
      safeDetails = undefined;
    }
  }
  return {
    code,
    message: message.slice(0, 500),
    details: safeDetails,
  };
}

export function openaiTimeoutMs(): number {
  const n = Number(process.env.SEO_ENGINE_OPENAI_TIMEOUT_MS || 60_000);
  return Number.isFinite(n) && n > 5_000 ? Math.min(n, 180_000) : 60_000;
}

export function openaiMaxTokens(): number {
  const n = Number(process.env.SEO_ENGINE_OPENAI_MAX_TOKENS || 8_000);
  return Number.isFinite(n) && n > 200 ? Math.min(n, 16_000) : 8_000;
}
