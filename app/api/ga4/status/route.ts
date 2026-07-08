import { NextRequest, NextResponse } from 'next/server';
import { probeGa4DataAccess } from '@/lib/ga4/data-client';
import { getGa4PropertyId } from '@/lib/ga4/property';
import { env } from '@/lib/config/env';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';

export const runtime = 'nodejs';

/**
 * GET /api/ga4/status — verificer GA4 Data API-adgang (dashboard-readiness).
 */
export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const propertyId = getGa4PropertyId();
  const hasAdminCreds = Boolean(
    env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() && env.FIREBASE_ADMIN_PRIVATE_KEY?.trim()
  );

  if (!propertyId) {
    return NextResponse.json({
      configured: false,
      missing: ['GA4_PROPERTY_ID'],
      hasAdminCreds,
    });
  }

  const probe = await probeGa4DataAccess();

  return NextResponse.json({
    configured: true,
    propertyId,
    serviceAccount: env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() || null,
    hasAdminCreds,
    dataApi: probe,
    measurement: {
      id: (env.GA4_MEASUREMENT_ID || env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim() || null,
      hasMpSecret: Boolean(env.GA4_MEASUREMENT_PROTOCOL_SECRET?.trim()),
    },
  });
}
