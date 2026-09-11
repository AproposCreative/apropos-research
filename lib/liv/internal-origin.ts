/**
 * Production cron requests can arrive on a protected, immutable deployment URL.
 * Calling that URL again hits Vercel SSO before our internal API auth can run.
 * Use the application's public production origin, still WITH internal API auth.
 * Do not derive the destination for production credentials from a request Host.
 * Preview/local calls remain isolated from production.
 */
export function livInternalOrigin(requestOrigin: string): string {
  if (process.env.VERCEL_ENV === 'production') {
    return 'https://ai.aproposmagazine.com';
  }
  const url = new URL(requestOrigin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('liv_internal_origin_invalid');
  }
  return url.origin;
}
