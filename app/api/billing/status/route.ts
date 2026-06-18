import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseUidFromRequest } from '@/lib/billing/auth-request';
import { checkBillingAccess } from '@/lib/billing/access';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await getFirebaseUidFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await checkBillingAccess(auth.uid);
  return NextResponse.json({
    allowed: result.allowed,
    billingDisabled: result.billingDisabled,
    subscription: result.subscription,
  });
}
