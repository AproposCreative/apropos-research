import { NextRequest, NextResponse } from 'next/server';
import { generateSeoMetaAI, generateSeoMetaSmart } from '@/lib/seo/generate-seo-meta';
import { handleApiError } from '@/app/api/error-handler';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/seo/generate
 *
 * @deprecated Soft-deprecated in favor of the Apropos SEO Engine
 * (`/api/seo-engine/*`, overlay `/ai?view=seo`). Kept for existing
 * single-shot draft flows (Liv/AI-chat) — do not build new SEO features
 * (auto-fill, history, JSON-LD, confidence bands) on top of this route.
 *
 * Body: { title?, subtitle?, intro?, content?, section?, keywords?, mode? }
 *  - mode: 'ai' (default) | 'smart'
 *
 * Returns: { seoTitle, seoDescription, primaryKeyword?, source }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      title,
      subtitle,
      intro,
      content,
      section,
      keywords,
      mode = 'ai',
    } = body || {};

    if (!title && !subtitle && !intro && !content) {
      return NextResponse.json(
        { error: 'Mindst ét felt (title, subtitle, intro eller content) skal angives.' },
        { status: 400 }
      );
    }

    const input = {
      title: typeof title === 'string' ? title : null,
      subtitle: typeof subtitle === 'string' ? subtitle : null,
      intro: typeof intro === 'string' ? intro : null,
      content: typeof content === 'string' ? content : null,
      section: typeof section === 'string' ? section : null,
      keywords: Array.isArray(keywords) ? keywords.filter((k) => typeof k === 'string') : undefined,
    };

    const result = mode === 'smart' ? generateSeoMetaSmart(input) : await generateSeoMetaAI(input);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { operation: 'seo/generate' });
  }
}
