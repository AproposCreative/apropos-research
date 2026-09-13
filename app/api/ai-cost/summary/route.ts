import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseUidFromRequest } from '@/lib/billing/auth-request';
import { readSharedCostSummary } from '@/lib/liv/cost-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const equal = (value: string, secret: string | undefined) => {
  const expected = secret?.trim();
  return !!expected && Buffer.byteLength(value) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected));
};

/** Read-only aggregate estimates. No public policy mutation/bootstrap endpoint.
 * Firebase-authenticated app users and existing trusted server credentials only;
 * no development authentication bypass, even when called without the proxy.
 */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const internal = request.headers.get('x-internal-api-secret') || '';
  const trusted = equal(bearer, process.env.CRON_SECRET) || equal(bearer, process.env.INTERNAL_API_SECRET) ||
    equal(internal, process.env.INTERNAL_API_SECRET);
  if (!trusted && !await getFirebaseUidFromRequest(request)) return json({ error: 'unauthorized' }, 401);
  return json(await readSharedCostSummary());
}
