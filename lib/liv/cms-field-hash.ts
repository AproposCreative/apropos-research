import { createHash } from 'node:crypto';

/** Key-order independent evidence for one exact CMS revision. */
export function cmsFieldHash(fields: Record<string, unknown>): string {
  const canonical = JSON.stringify(fields, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
  return createHash('sha256').update(canonical).digest('hex');
}
