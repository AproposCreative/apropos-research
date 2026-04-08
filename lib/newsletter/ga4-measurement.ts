import { createHash } from 'node:crypto';
import { env } from '@/lib/config/env';

/** Stabil pseudo-client_id til GA4 MP (ikke PII i rå form). */
export function ga4ClientIdFromEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

function measurementId(): string | undefined {
  const a = env.GA4_MEASUREMENT_ID?.trim();
  if (a) return a;
  return env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
}

/**
 * Sender én custom event til GA4 Measurement Protocol (server-side).
 * Kræver GA4_MEASUREMENT_PROTOCOL_SECRET + measurement id i env.
 */
export async function sendGa4MeasurementEvent(input: {
  name: string;
  params?: Record<string, string | number | undefined>;
  clientId: string;
}): Promise<boolean> {
  const mid = measurementId();
  const secret = env.GA4_MEASUREMENT_PROTOCOL_SECRET?.trim();
  if (!mid || !secret) return false;

  const params = Object.fromEntries(
    Object.entries(input.params || {}).filter(([, v]) => v !== undefined)
  ) as Record<string, string | number>;

  const url = new URL('https://www.google-analytics.com/mp/collect');
  url.searchParams.set('measurement_id', mid);
  url.searchParams.set('api_secret', secret);

  const body = {
    client_id: input.clientId,
    events: [{ name: input.name, params }],
  };

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}
