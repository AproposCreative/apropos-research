import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { getPodcastJob } from '@/lib/podcast/job-store';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!jobId) {
    return NextResponse.json({ error: 'Manglende jobId' }, { status: 400 });
  }

  const job = await getPodcastJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job ikke fundet' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    status: job.status,
    step: job.step,
    failedStep: job.failedStep,
    error: job.error,
    title: job.title,
    slug: job.slug,
  });
}
