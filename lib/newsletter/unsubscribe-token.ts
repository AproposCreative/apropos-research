import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 1 as const;

/** Signeret payload: e-mail + udløb (standard 365 dage). */
export function createUnsubscribeToken(email: string, secret: string, ttlSeconds = 365 * 24 * 3600): string {
  const e = email.trim().toLowerCase();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ v: VERSION, e, exp }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): { email: string } | null {
  try {
    const lastDot = token.lastIndexOf('.');
    if (lastDot < 1) return null;
    const payloadB64 = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      v: number;
      e: string;
      exp: number;
    };
    if (parsed.v !== VERSION || typeof parsed.e !== 'string' || typeof parsed.exp !== 'number') return null;
    if (Date.now() / 1000 > parsed.exp) return null;
    return { email: parsed.e };
  } catch {
    return null;
  }
}
