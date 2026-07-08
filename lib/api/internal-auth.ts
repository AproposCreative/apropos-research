/**
 * Headers for server-side calls to this app's own /api/* routes (cron, Liv pipeline, etc.).
 */
export function internalApiHeaders(
  extra?: HeadersInit
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const secret =
    process.env.INTERNAL_API_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    '';

  if (secret) {
    headers['x-internal-api-secret'] = secret;
  }

  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (Array.isArray(extra)) {
      for (const [k, v] of extra) {
        if (typeof v === 'string') headers[k] = v;
      }
    } else {
      Object.assign(headers, extra);
    }
  }

  return headers;
}
