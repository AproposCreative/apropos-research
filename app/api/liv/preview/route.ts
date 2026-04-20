/**
 * Liv Brandt — preview-endpoint til UI'et i web-apps panelet.
 *
 * Returnerer dagens planlagte emne (samme `pickLivTopic` som cron'en bruger)
 * og — når `?generate=1` er sat — også en fuld AI-genereret forhåndsvisning
 * af artiklen + SEO-felter, uden at publish'e til Webflow.
 *
 * Auth: Firebase ID-token (samme mønster som /api/liv/status og nyhedsbrevet).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { pickLivTopic, type PickedTopic } from '@/lib/liv/pick-topic';
import { generateLivArticle } from '@/lib/liv/generate-article';
import { todayDayKeyUTC } from '@/lib/liv/daily-history-store';
import { logger } from '@/lib/logger';
import { env } from '@/lib/config/env';

export const maxDuration = 120;

function resolveBaseUrl(req: NextRequest): string {
  const fromHeader = req.nextUrl.origin;
  if (fromHeader && /^https?:\/\//.test(fromHeader)) return fromHeader;
  const prodHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, '');
  if (prodHost) return `https://${prodHost}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL.replace(/^https?:\/\//, '')}`;
  return env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || 'http://localhost:3000';
}

function previewImageFor(topic: PickedTopic | null): string | null {
  const url = topic?.source?.url;
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // Google's S2 favicon-service — gratis, hurtigt, kræver ingen ekstra integration.
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const generate = sp.get('generate') === '1' || sp.get('generate')?.toLowerCase() === 'true';
  const baseUrl = resolveBaseUrl(req);
  const dayKey = todayDayKeyUTC();

  try {
    const topic = await pickLivTopic({ baseUrl });

    if (!topic) {
      return NextResponse.json({
        ok: true,
        dayKey,
        topic: null,
        reason: 'Ingen trending-artikler matcher Liv\'s temaer lige nu.',
      });
    }

    const previewImageUrl = previewImageFor(topic);

    if (!generate) {
      return NextResponse.json({
        ok: true,
        dayKey,
        topic,
        previewImageUrl,
      });
    }

    const article = await generateLivArticle({ topic });

    return NextResponse.json({
      ok: true,
      dayKey,
      topic,
      previewImageUrl,
      article: {
        title: article.title,
        subtitle: article.subtitle,
        intro: article.intro,
        content: article.content,
        slug: article.slug,
        excerpt: article.excerpt,
        section: article.section,
        tags: article.tags,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        primaryKeyword: article.primaryKeyword,
        wordCount: article.content.split(/\s+/).filter(Boolean).length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    logger.error(
      '[api/liv/preview] failed',
      e instanceof Error ? e : new Error(msg),
      { dayKey, generate }
    );
    return NextResponse.json({ error: msg, dayKey }, { status: 500 });
  }
}
