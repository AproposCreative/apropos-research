import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Validerer Webflow API v2 webhook-signatur (x-webflow-timestamp + x-webflow-signature).
 * Secret = Client Secret fra Webflow Data Client / workspace app.
 */
export function verifyWebflowWebhookSignature(args: {
  body: string;
  timestamp: string;
  signature: string;
  secret: string;
}): boolean {
  const { body, timestamp, signature, secret } = args;
  if (!timestamp || !signature || !secret) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}:${body}`).digest('hex');
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
