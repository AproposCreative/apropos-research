import { createHash } from 'crypto';

/** Felter der udløser genoversættelse når de ændres (billeder ignoreres). */
const HASH_KEYS = ['name', 'subtitle', 'intro', 'content', 'seo-title', 'meta-description'] as const;

export function buildTranslationSourcePayload(fieldData: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of HASH_KEYS) {
    const v = fieldData[key];
    out[key] = typeof v === 'string' ? v.trim() : v != null ? String(v) : '';
  }
  return out;
}

export function computeTranslationSourceHash(fieldData: Record<string, unknown>): string {
  const payload = buildTranslationSourcePayload(fieldData);
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
