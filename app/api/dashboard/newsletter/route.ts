import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { fetchNewsletterDashboard } from '@/lib/dashboard/newsletter-data';
import { parseDashboardPeriod } from '@/lib/dashboard/period';
const headers = { 'Cache-Control': 'private, no-store' };
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return NextResponse.json({ error: 'Log ind som ejer.' }, { status: 401, headers });
  if (!access.owner) return NextResponse.json({ error: 'Kun ejeren har adgang til modtageroplysninger.' }, { status: 403, headers });
  try {
    const recipients = await getNewsletterRecipients();
    const data = await fetchNewsletterDashboard(parseDashboardPeriod(req.nextUrl.searchParams.get('period')), recipients);
    return NextResponse.json({ data, audienceError: Boolean(recipients.error || recipients.verified === false), generatedAt: new Date().toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: 'Nyhedsbrevsdata kunne ikke hentes. Prøv igen.' }, { status: 503, headers });
  }
}
