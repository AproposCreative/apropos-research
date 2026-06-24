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

type ImageInput = string | { url?: string; name?: string };

interface ImportRequestBody {
  articleText?: string;
  images?: { hero?: ImageInput; body1?: ImageInput; body2?: ImageInput };
  sections?: CmsOption[];
  topics?: CmsOption[];
  authors?: CmsOption[];
  streamingServices?: CmsOption[];
}

const asImage = (value: ImageInput | undefined): { url: string; name: string | null } => {
  if (!value) return { url: '', name: null };
  if (typeof value === 'string') return { url: value.trim(), name: null };
  return { url: String(value.url || '').trim(), name: value.name ? String(value.name) : null };
};

/** Kør async-opgaver med en max-parallelitet (bevarer rækkefølgen i resultatet). */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), tasks.length) }, async () => {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return results;
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
    const heroImg = asImage(body.images?.hero);
    const body1Img = asImage(body.images?.body1);
    const body2Img = asImage(body.images?.body2);
    const hero = heroImg.url;
    const body1 = body1Img.url;
    const body2 = body2Img.url;

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

    requestLogger.info('Import: analyzing + optimizing (parallel)', { length: articleText.length });

    // Provisorisk filnavn-base fra artiklens første linje, så billedoptimering kan
    // køre PARALLELT med AI-analysen (de er uafhængige). Det halverer ~wall-clock og
    // er den vigtigste sikring mod 504-timeout.
    const provisionalTitle =
      articleText
        .replace(/<[^>]+>/g, ' ')
        .split(/\n|\.\s/)
        .map((s) => s.trim())
        .find(Boolean) || 'importeret-artikel';
    const baseName = resolveArticleSeoImageBaseName({
      slug: deriveSlug(provisionalTitle),
      title: provisionalTitle,
    });

    // Hero: desktop (cap 2400px) + mobil-variant. Body: 2 inline content-billeder.
    // effort 4 + begrænset parallelitet holder store fotos under funktionens tidsgrænse
    // og undgår memory-spikes (4 fulde dekodninger på én gang -> OOM/504).
    const imageTasks: Array<() => Promise<{ url: string }>> = [
      () =>
        optimizeAndUploadImage({
          imageUrl: hero,
          folder: 'webflow/thumb-images',
          role: 'thumb',
          baseName,
          maxLongEdge: 2400,
          maxSizeKB: 400,
          effort: 4,
        }),
      () =>
        optimizeAndUploadImage({
          imageUrl: hero,
          folder: 'webflow/mobile-images',
          role: 'mobile',
          baseName,
          maxLongEdge: 1200,
          maxSizeKB: 200,
          effort: 4,
        }),
      () =>
        optimizeAndUploadImage({
          imageUrl: body1,
          folder: 'webflow/content-images',
          role: 'inline-01',
          baseName,
          maxLongEdge: 1200,
          maxSizeKB: 220,
          effort: 4,
        }),
      () =>
        optimizeAndUploadImage({
          imageUrl: body2,
          folder: 'webflow/content-images',
          role: 'inline-02',
          baseName,
          maxLongEdge: 1200,
          maxSizeKB: 220,
          effort: 4,
        }),
    ];

    const [analysis, [heroDesktop, heroMobile, bodyOne, bodyTwo]] = await Promise.all([
      analyzeArticleForImport(openai, {
        articleText,
        sections: asOptions(body.sections),
        topics: asOptions(body.topics),
        authors: asOptions(body.authors),
        streamingServices: asOptions(body.streamingServices),
      }),
      runWithConcurrency(imageTasks, 2),
    ]);

    const articleUpdate = buildImportArticleUpdate({
      analysis,
      heroImageUrl: heroDesktop.url,
      mobileImageUrl: heroMobile.url,
      bodyImageUrls: [bodyOne.url, bodyTwo.url],
      heroImageName: heroImg.name,
      bodyImageNames: [body1Img.name, body2Img.name],
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
