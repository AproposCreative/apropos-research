import { createHash } from 'node:crypto';
import type { SeoEngineInputContract } from '@/lib/seo-engine/schema';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Stable JSON for hashing — sorted object keys, trimmed strings, omit null/undefined/''. */
export function canonicalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? undefined : t;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue).filter((v) => v !== undefined);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const next = canonicalizeValue(value[key]);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return undefined;
}

export function canonicalizeInput(input: SeoEngineInputContract): string {
  return JSON.stringify(canonicalizeValue(input));
}

export function computeInputVersionHash(input: SeoEngineInputContract): string {
  return createHash('sha256').update(canonicalizeInput(input), 'utf8').digest('hex');
}

export function hashQuote(quote: string): string {
  const normalized = quote.trim().replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
