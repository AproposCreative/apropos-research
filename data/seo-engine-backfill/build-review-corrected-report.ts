#!/usr/bin/env npx tsx
/**
 * Build review-corrected frozen dry-run report from prior composite.
 * Regenerates ONLY seoTitle when review-keyword rule fails.
 * Keeps meta, prior reports, refreshes source signatures from live CMS.
 * Zero CMS writes.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

const COMPOSITE = join(root, 'tmp/seo-engine-backfill/report-composite-2026-07-22T21-28-46.json');

/** Effective types from prior analysis/editor intent for the frozen 10 articles. */
const TYPE_BY_SLUG: Record<string, string> = {
  '007-first-light-review-restore-tmp': 'Spilanmeldelse',
  'derfor-siger-jeg-altid-at-jeg-er-hollaender-pa-ferie': 'Essay',
  'lucky-apple-tv-anmeldelse': 'Serieanmeldelse',
  'the-odyssey-anmeldelse': 'Filmanmeldelse',
  'copenhell-onsdag-nonner-i-corpse-paint-og-tom-morello-i-hopla': 'Festivalanmeldelse',
  'kunst-pa-roskilde-festival-2026': 'Feature',
  'little-simz-pa-roskilde-festival-2026': 'Koncertanmeldelse',
  'mille-pa-roskilde-festival-2026': 'Koncertanmeldelse',
  'young-miko-pa-roskilde-festival-2026': 'Koncertanmeldelse',
  'napalm-death-pa-roskilde-festival-2026': 'Koncertanmeldelse',
};

async function regenerateTitleViaAi(args: {
  locale: 'da' | 'en';
  entity: string;
  articleType: string;
  priorTitle: string;
  meta: string;
  editorialTitle: string;
}): Promise<string | null> {
  const { getOpenAIClient, models } = await import('../../lib/openai');
  const client = getOpenAIClient();
  if (!client) return null;
  const { buildRegenerateSystemPrompt } = await import('../../lib/seo-engine/prompts');
  const { SEO_TITLE_MAX } = await import('../../lib/seo/constants');
  const keyword =
    args.locale === 'en'
      ? 'Must include whole word review or reviews'
      : 'Must include whole word anmeldelse or anmeldelser';
  const completion = await client.chat.completions.create({
    model: models.default,
    temperature: 0.35,
    max_completion_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildRegenerateSystemPrompt() },
      {
        role: 'user',
        content: JSON.stringify({
          fieldPath: 'seoTitle',
          editorInstruction: `Rewrite seoTitle only. Entity-first, natural, ≤${SEO_TITLE_MAX} chars. ${keyword}. Keep editorial stance from meta. No keyword stuffing, no forbidden phrases. Do not change facts.`,
          lockedAnalysis: {
            articleType: { suggested: args.articleType, editor: args.articleType },
            primaryEntity: { asWritten: args.entity },
          },
          currentFields: {
            seoTitle: { value: args.priorTitle, locked: false },
            metaDescription: { value: args.meta, locked: true },
          },
          contractMeta: {
            editorialTitle: args.editorialTitle,
            language: args.locale,
            articleType: args.articleType,
          },
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw) as { value?: unknown };
    const v = typeof parsed.value === 'string' ? parsed.value.trim() : '';
    return v || null;
  } catch {
    return null;
  }
}

function fallbackTitle(locale: 'da' | 'en', entity: string, prior: string): string {
  const { SEO_TITLE_MAX } = require('../../lib/seo/constants') as {
    SEO_TITLE_MAX: number;
  };
  const { buildReviewAwareDemoSeoTitle } = require('../../lib/seo-engine/review-title-rule') as {
    buildReviewAwareDemoSeoTitle: (a: {
      entity: string;
      language: string;
      articleType: string;
      maxLen: number;
    }) => string;
  };
  // Prefer keeping descriptive tail from prior when short enough
  const kw = locale === 'en' ? 'review' : 'anmeldelse';
  if (prior.toLowerCase().includes(kw)) return prior;
  const candidate =
    locale === 'en'
      ? `${entity} ${kw}`
      : prior.includes('på') || prior.includes('at')
        ? `${entity} ${kw}`
        : `${entity} ${kw}`;
  if (candidate.length <= SEO_TITLE_MAX) return candidate;
  return buildReviewAwareDemoSeoTitle({
    entity,
    language: locale,
    articleType: 'Koncertanmeldelse',
    maxLen: SEO_TITLE_MAX,
  });
}

async function main() {
  const {
    checkReviewSeoTitle,
    seoTitleHasReviewKeyword,
  } = await import('../../lib/seo-engine/review-title-rule');
  const {
    assertDryRunReportCleanForApply,
    buildSourceSignature,
    buildOverwriteSeoEngineInput,
    readCmsSeoPair,
    writeDryRunReport,
    validateOverwriteFields,
  } = await import('../../lib/seo-engine/overwrite-backfill');
  const { fetchArticleItemByLocale, resolveWebflowLocaleIds } = await import(
    '../../lib/webflow/locale-items'
  );
  const { SEO_TITLE_MAX } = await import('../../lib/seo/constants');

  const composite = JSON.parse(readFileSync(COMPOSITE, 'utf8'));
  const localeIds = resolveWebflowLocaleIds();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(root, `tmp/seo-engine-backfill/report-review-corrected-${stamp}.json`);

  const corrections: Array<Record<string, unknown>> = [];
  const frozenManifest: unknown[] = [];

  for (const item of composite.results) {
    const slug = String(item.slug || '');
    const articleType = TYPE_BY_SLUG[slug] || 'Feature';
    for (const loc of item.locales) {
      if (loc.status !== 'proposed' || !loc.proposal) continue;
      const locale = loc.locale as 'da' | 'en';
      const cmsLocaleId = locale === 'da' ? localeIds.dk : localeIds.en;
      const p = loc.proposal;
      let newSeoTitle = String(p.newSeoTitle || '').trim();
      const meta = String(p.newMetaDescription || '').trim();
      const priorFrozen = newSeoTitle;
      const check = checkReviewSeoTitle({
        seoTitle: newSeoTitle,
        language: locale,
        articleType,
      });

      let reviewTitleCorrected = false;
      if (check.applies && !check.ok) {
        const entity =
          slug
            .split('-pa-')[0]
            ?.split('-')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
            .replace('007 First Light Review Restore Tmp', '007 First Light') ||
          String(p.title || '').split(/[:–—-]/)[0]?.trim() ||
          'Artikel';
        const aiTitle = await regenerateTitleViaAi({
          locale,
          entity: String(p.title || entity).split(/[:–—]/)[0]?.trim() || entity,
          articleType,
          priorTitle: newSeoTitle,
          meta,
          editorialTitle: String(p.title || ''),
        });
        let next = aiTitle || fallbackTitle(locale, entity, newSeoTitle);
        // Validate; retry fallback if AI missed keyword / length
        let v = validateOverwriteFields({
          seoTitle: next,
          metaDescription: meta,
          language: locale,
          articleType,
        });
        if (!v.ok || next.length > SEO_TITLE_MAX) {
          next = fallbackTitle(
            locale,
            String(p.title || entity).split(/[:–—]/)[0]?.trim() || entity,
            newSeoTitle
          );
          v = validateOverwriteFields({
            seoTitle: next,
            metaDescription: meta,
            language: locale,
            articleType,
          });
        }
        if (!v.ok) {
          console.error('BLOCKED correction', item.itemId, locale, v.errors);
          process.exit(2);
        }
        newSeoTitle = next;
        reviewTitleCorrected = true;
        corrections.push({
          itemId: item.itemId,
          slug,
          locale,
          articleType,
          from: priorFrozen,
          to: newSeoTitle,
        });
      }

      // Refresh live source signature (no write)
      const live = await fetchArticleItemByLocale(item.itemId, cmsLocaleId);
      const oldPair = readCmsSeoPair(live.fieldData);
      const input = buildOverwriteSeoEngineInput({
        fieldData: live.fieldData,
        language: locale,
      });
      const sourceSignature = buildSourceSignature({
        item: live,
        input,
        oldSeoTitle: oldPair.seoTitle,
        oldMetaDescription: oldPair.metaDescription,
      });

      const fieldCheck = validateOverwriteFields({
        seoTitle: newSeoTitle,
        metaDescription: meta,
        language: locale,
        articleType,
      });

      loc.proposal = {
        ...p,
        cmsLocaleId,
        newSeoTitle,
        newMetaDescription: meta,
        oldSeoTitle: oldPair.seoTitle,
        oldMetaDescription: oldPair.metaDescription,
        validationErrors: fieldCheck.errors,
        validationWarnings: p.validationWarnings || [],
        sourceSignature,
        effectiveArticleType: articleType,
        reviewTitleCorrected,
        priorFrozenSeoTitle: reviewTitleCorrected ? priorFrozen : undefined,
      };

      frozenManifest.push({
        itemId: item.itemId,
        locale,
        cmsLocaleId,
        articleKey: p.articleKey,
        newSeoTitle,
        newMetaDescription: meta,
        wasPublished: true,
        sourceSignature,
      });

      // Final keyword sanity for review types
      if (
        check.applies &&
        !seoTitleHasReviewKeyword(newSeoTitle, locale)
      ) {
        console.error('Still missing review keyword', slug, locale, newSeoTitle);
        process.exit(2);
      }
    }
  }

  const report = {
    ...composite,
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    mode: 'dry-run',
    kind: 'review-corrected',
    basedOnReport: COMPOSITE,
    reviewCorrections: corrections,
    stoppedOnError: false,
    errorMessage: null,
    frozenManifest,
    backupPath: composite.backupPath || null,
  };

  const clean = assertDryRunReportCleanForApply(report);
  writeDryRunReport(outPath, report);
  // Also write a stable alias path
  const alias = join(root, 'tmp/seo-engine-backfill/report-review-corrected-latest.json');
  writeDryRunReport(alias, report);

  console.log(
    JSON.stringify(
      {
        outPath,
        alias,
        clean: clean.ok,
        cleanReason: clean.ok === false ? clean.reason : null,
        corrections,
        proposed: frozenManifest.length,
      },
      null,
      2
    )
  );
  if (!clean.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
