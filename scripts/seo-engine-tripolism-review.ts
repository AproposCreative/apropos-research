/**
 * One-shot: run Tripolism draft through SEO Engine analyze → strategize,
 * print review, apply CMS-writable seo-title + meta-description to the draft.
 *
 * Usage:
 *   npx tsx scripts/seo-engine-tripolism-review.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const COLLECTION_ID = '67dbf17ba540975b5b21c2a6';
const ITEM_ID = '6a703160ec9c0b3084489af6';
const USER_ID = 'seo-engine-cli-tripolism';

async function fetchItem() {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error('WEBFLOW_API_TOKEN mangler');
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/${ITEM_ID}`,
    { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`Webflow GET ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{
    id: string;
    fieldData: Record<string, unknown>;
    lastUpdated?: string;
  }>;
}

async function patchSeoFields(patch: Record<string, string>) {
  const token = process.env.WEBFLOW_API_TOKEN!;
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/${ITEM_ID}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fieldData: patch, isDraft: true }),
    }
  );
  if (!res.ok) throw new Error(`Webflow PATCH ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // Dynamic imports AFTER dotenv so OpenAI/Firebase see env
  const { analyzeArticle, strategizeFromRun } = await import('../lib/seo-engine/pipeline');
  const { webflowItemToSeoEngineInput } = await import('../lib/seo-engine/cms-contract');
  const { toWebflowSeoPatch } = await import('../lib/seo-engine/webflow-adapter');
  const {
    resolveEffectiveArticleType,
    seoTitleHasReviewKeyword,
  } = await import('../lib/seo-engine/review-title-rule');
  const { getOpenAIClient } = await import('../lib/openai');

  if (!getOpenAIClient()) {
    throw new Error('OpenAI client er null efter dotenv — tjek OPENAI_API_KEY');
  }

  const item = await fetchItem();
  const fd = item.fieldData;

  let input = webflowItemToSeoEngineInput({
    fieldData: fd,
    language: 'da',
    existingUrl: `https://www.aproposmagazine.com/articles/${String(fd.slug || '')}`,
  });

  input = {
    ...input,
    // Allow SEO Engine to propose fresh title/meta (review overwrite), not lock current CMS
    existingSeoTitle: null,
    existingMetaDescription: null,
    articleType: 'Festivalanmeldelse',
    rating: typeof fd.stjerne === 'number' ? fd.stjerne : 5,
    festival: 'O Days',
    venue: 'Orangeriet',
    city: 'København',
    eventDate: '2026-08-01',
    author: 'Liv Brandt',
    section: 'Musik',
    freshnessHint: 'timely',
    relatedAproposArticles: [
      {
        id: '69d37bffe6964f9446b0eb65',
        url: 'https://www.aproposmagazine.com/articles/o-days-2026-guide',
        title: 'O Days 2026 guide',
      },
    ],
    knownFacts: [
      'Festivalnavn: O Days (ikke Odays)',
      'Scene: Orangeriet, Refshaleøen',
      'Stjerne: 5/6',
      'Coachella 2025: to weekender (ikke dokumenteret som eneste danske act)',
    ],
    notesForAi:
      'articleType.editor SKAL være præcis Festivalanmeldelse. Behold O Days-stavning. SEO-titel skal indeholde ordet anmeldelse som selvstændigt ord. Slug: tripolism-o-days-2026-anmeldelse. Image mangler stadig i CMS.',
  };

  console.log(
    JSON.stringify(
      {
        phase: 'input',
        title: input.editorialTitle,
        slug: input.existingSlug,
        bodyChars: (input.body || '').length,
        rating: input.rating,
        festival: input.festival,
        existingSeoTitle: input.existingSeoTitle,
      },
      null,
      2
    )
  );

  const analysis = await analyzeArticle(input, {
    userId: USER_ID,
    webflowItemId: ITEM_ID,
    articleKey: `webflow:${ITEM_ID}`,
  });

  const effectiveType = resolveEffectiveArticleType(analysis.analysis, input.articleType);

  console.log(
    JSON.stringify(
      {
        phase: 'analyze',
        analysisRunId: analysis.analysisRunId,
        mode: analysis.mode,
        articleType: analysis.analysis.articleType,
        effectiveType,
        primaryEntity: analysis.analysis.primaryEntity,
        work: analysis.analysis.work,
        stance: analysis.analysis.stanceOrVerdict,
        searchIntent: analysis.analysis.searchIntent,
        evidenceIssues: analysis.evidenceIssues,
        searchSignals: analysis.searchSignalsProvenance
          ? {
              available: analysis.searchSignalsProvenance.signalsAvailable,
              uiNote: analysis.searchSignalsProvenance.uiNote,
            }
          : null,
      },
      null,
      2
    )
  );

  const strategy = await strategizeFromRun(analysis.analysisRunId, {
    userId: USER_ID,
    currentInput: input,
  });

  const fields = strategy.pack.recommended.fields;
  const seoTitle = fields.seoTitle?.value || '';
  const meta = fields.metaDescription?.value || '';
  const slug = fields.slug?.value || '';
  const hasReviewKw = seoTitleHasReviewKeyword(seoTitle, input.language);

  const report = {
    phase: 'strategize',
    seoVersionId: strategy.seoVersionId,
    mode: strategy.mode,
    stale: strategy.stale,
    recommendedStrategyId: strategy.pack.recommendedStrategyId,
    validation: {
      errors: strategy.validation.errors,
      warnings: strategy.validation.warnings,
      suggestions: strategy.validation.suggestions,
    },
    recommended: {
      seoTitle,
      seoTitleHasAnmeldelse: hasReviewKw,
      metaDescription: meta,
      slug,
      canonical: fields.canonical?.value || null,
      primaryPhrase: fields.primaryPhrase?.value || null,
      imageAlt: fields.imageAlt?.value || null,
      section: fields.section?.value || null,
      internalLinks: (fields.internalLinks?.value || []).slice(0, 5),
      checklist: fields.checklist?.value || [],
      risks: fields.risks?.value || [],
      jsonLdTypes: (
        (fields.jsonLd?.value as { '@graph'?: Array<{ '@type'?: string }> })?.['@graph'] || []
      ).map((n) => n['@type']),
    },
    alternatives: (strategy.pack.alternatives || []).map((a) => ({
      id: a.id,
      family: a.family,
      seoTitle: a.fields?.seoTitle?.value || null,
    })),
  };

  console.log(JSON.stringify(report, null, 2));

  const hard = strategy.validation.errors || [];
  if (hard.length > 0) {
    console.log(
      JSON.stringify({
        phase: 'apply',
        skipped: true,
        reason: 'validation errors',
        hard,
      })
    );
    process.exitCode = 2;
    return;
  }

  const keepSlug = String(fd.slug || 'tripolism-o-days-2026-anmeldelse');
  const patch = toWebflowSeoPatch({
    seoTitle: seoTitle || undefined,
    metaDescription: meta || undefined,
  });
  if (slug && /anmeldelse/i.test(slug) && /o-days/i.test(slug)) {
    patch.slug = slug;
  } else {
    patch.slug = keepSlug;
  }

  const updated = await patchSeoFields(patch);
  console.log(
    JSON.stringify(
      {
        phase: 'apply',
        ok: true,
        patched: patch,
        draftStill: true,
        itemId: updated?.id || ITEM_ID,
        note: 'JSON-LD/OG genereret i engine men ikke skrevet til Webflow (generated_not_published). Billeder mangler stadig.',
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  if (e && typeof e === 'object' && 'code' in e) {
    console.error('code:', (e as { code?: string }).code);
  }
  if (e && typeof e === 'object' && 'details' in e) {
    console.error('details:', JSON.stringify((e as { details?: unknown }).details, null, 2));
  }
  process.exit(1);
});
