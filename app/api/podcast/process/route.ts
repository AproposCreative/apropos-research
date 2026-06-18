import { randomUUID } from 'crypto';
import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { createPodcastJob } from '@/lib/podcast/job-store';
import { resolveArticleBySlug } from '@/lib/podcast/resolve-article';
import { slugFromArticleUrl } from '@/lib/podcast/slug-from-url';
import { runPodcastPipeline } from '@/lib/podcast/run-pipeline';
import { triggerCloudPodcastProcessor } from '@/lib/podcast/trigger-processor';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  let body: { slug?: string; articleUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 });
  }

  const articleUrl = typeof body.articleUrl === 'string' ? body.articleUrl.trim() : '';
  const slugInput = typeof body.slug === 'string' ? body.slug.trim() : '';

  const slug =
    slugInput ||
    (() => {
      const parsed = slugFromArticleUrl(articleUrl);
      return parsed.ok ? parsed.slug : '';
    })();

  if (!slug) {
    return NextResponse.json({ error: 'Manglende eller ugyldig slug' }, { status: 400 });
  }

  const article = await resolveArticleBySlug(slug);
  if (!article) {
    return NextResponse.json({ error: 'Artikel ikke fundet på aproposmagazine.dk' }, { status: 404 });
  }

  const jobId = randomUUID();
  const payload = { jobId, slug, articleUrl: article.articleUrl };

  await createPodcastJob({
    jobId,
    slug,
    articleUrl: article.articleUrl,
    title: article.title,
  });

  const sentToCloud = await triggerCloudPodcastProcessor(payload);
  if (!sentToCloud) {
    after(async () => {
      try {
        await runPodcastPipeline(payload);
      } catch (err) {
        console.error('[podcast] pipeline failed', jobId, err);
      }
    });
  }

  return NextResponse.json({ ok: true, jobId });
}
