import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getOpenAIClient } from '@/lib/openai';
import { optimizeAndUploadImage } from '@/lib/images/optimize-and-upload';
import { resolveArticleSeoImageBaseName } from '@/lib/images/seo-image-name';
import {
  analyzeArticleForImport,
  buildImportArticleUpdate,
  type CmsOption,
} from '@/lib/articles/import-autofill';
import { deriveSlug } from '@/lib/articles/seo-utils';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface ImportRequestBody {
  articleText?: string;
  images?: { hero?: string; body1?: string; body2?: string };
  sections?: CmsOption[];
  topics?: CmsOption[];
  authors?: CmsOption[];
  streamingServices?: CmsOption[];
}

const asOptions = (value: unknown): CmsOption[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { name: item } as CmsOption;
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name : typeof o.title === 'string' ? o.title : '';
        if (!name) return null;
        return {
          id: typeof o.id === 'string' ? o.id : undefined,
          name,
          slug: typeof o.slug === 'string' ? o.slug : undefined,
        } as CmsOption;
      }
      return null;
    })
    .filter((o): o is CmsOption => Boolean(o));
};

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);

  try {
    const body = (await req.json()) as ImportRequestBody;
    const articleText = String(body.articleText || '').trim();
    const hero = body.images?.hero?.trim();
    const body1 = body.images?.body1?.trim();
    const body2 = body.images?.body2?.trim();

    if (!articleText) {
      return NextResponse.json(
        createErrorResponse('Artikelteksten mangler.', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    if (!hero || !body1 || !body2) {
      return NextResponse.json(
        createErrorResponse('Importér artikel kræver 3 billeder (1 hero + 2 til brødteksten).', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json(
        createErrorResponse('AI-tjenesten er ikke konfigureret (OPENAI_API_KEY mangler).', {
          statusCode: 500,
          errorCode: ErrorCode.INTERNAL_ERROR,
          requestId,
        }),
        { status: 500 }
      );
    }

    requestLogger.info('Import: analyzing article', { length: articleText.length });

    const analysis = await analyzeArticleForImport(openai, {
      articleText,
      sections: asOptions(body.sections),
      topics: asOptions(body.topics),
      authors: asOptions(body.authors),
      streamingServices: asOptions(body.streamingServices),
    });

    const baseName = resolveArticleSeoImageBaseName({
      slug: deriveSlug(analysis.title),
      seoTitle: analysis.seoTitle,
      title: analysis.title,
    });

    requestLogger.info('Import: optimizing images', { baseName });

    // Hero: desktop (preserve dims) + mobil-variant. Body: 2 inline content-billeder.
    const [heroDesktop, heroMobile, bodyOne, bodyTwo] = await Promise.all([
      optimizeAndUploadImage({
        imageUrl: hero,
        folder: 'webflow/thumb-images',
        role: 'thumb',
        baseName,
        preserveDimensions: true,
        maxLongEdge: 2400,
        maxSizeKB: 400,
      }),
      optimizeAndUploadImage({
        imageUrl: hero,
        folder: 'webflow/mobile-images',
        role: 'mobile',
        baseName,
        maxLongEdge: 1200,
        maxSizeKB: 200,
      }),
      optimizeAndUploadImage({
        imageUrl: body1,
        folder: 'webflow/content-images',
        role: 'inline-01',
        baseName,
        maxLongEdge: 1200,
        maxSizeKB: 220,
      }),
      optimizeAndUploadImage({
        imageUrl: body2,
        folder: 'webflow/content-images',
        role: 'inline-02',
        baseName,
        maxLongEdge: 1200,
        maxSizeKB: 220,
      }),
    ]);

    const articleUpdate = buildImportArticleUpdate({
      analysis,
      heroImageUrl: heroDesktop.url,
      mobileImageUrl: heroMobile.url,
      bodyImageUrls: [bodyOne.url, bodyTwo.url],
    });

    requestLogger.info('Import: complete', {
      title: articleUpdate.title,
      wordCount: articleUpdate.wordCount,
      readTime: articleUpdate.readTime,
    });

    return NextResponse.json(
      createSuccessResponse(
        {
          articleUpdate,
          images: {
            hero: heroDesktop.url,
            heroMobile: heroMobile.url,
            body: [bodyOne.url, bodyTwo.url],
          },
        },
        { requestId }
      )
    );
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    requestLogger.error('Import article error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Import af artikel fejlede.', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
