import { NextResponse } from 'next/server';

export function jsonError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ ok: false, code, error: message, ...extra }, { status });
}

export function mapPipelineError(e: unknown) {
  const err = e as Error & { code?: string; details?: unknown };
  const code = err.code || 'internal';
  const message = err.message || 'Ukendt fejl';
  const statusByCode: Record<string, number> = {
    invalid_input: 400,
    invalid_patch: 400,
    invalid_field_path: 400,
    field_locked: 400,
    invalid_adopt: 400,
    analysis_failed: 400,
    demo_ephemeral: 400,
    input_too_large: 413,
    unauthorized: 401,
    forbidden: 403,
    not_found: 404,
    snapshot_missing: 404,
    stale_input: 409,
    revision_conflict: 409,
    rate_limited: 429,
    rate_limit_unavailable: 503,
    fail_closed: 503,
    demo_blocked: 503,
    ai_parse_error: 502,
    ai_schema_error: 502,
    ai_timeout: 504,
  };
  return jsonError(statusByCode[code] || 500, code, message, {
    details: err.details,
  });
}
