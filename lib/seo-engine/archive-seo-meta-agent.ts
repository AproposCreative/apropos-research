/**
 * Dedicated Arkiv seo_meta agent: ONE title + meta.
 * No strategy pack, no 2-alternatives fail-closed.
 */

import { getOpenAIClient, models } from '@/lib/openai';
import { checkReviewSeoTitle } from '@/lib/seo-engine/review-title-rule';
import { findForbiddenPhrases } from '@/lib/seo-engine/forbidden-phrases';
import { stripHtmlToText } from '@/lib/seo-engine/html-text';

const SEO_TITLE_MAX = 70;
const META_MAX = 160;
const META_MIN = 70;

export type ArchiveSeoMetaProposal = {
  seoTitle: string;
  metaDescription: string;
  articleTypeHint: string | null;
  mode: 'ai' | 'heuristic';
};

function clampTitle(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= SEO_TITLE_MAX) return t;
  return `${t.slice(0, SEO_TITLE_MAX - 1).trim()}…`;
}

function clampMeta(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= META_MAX) return t;
  return `${t.slice(0, META_MAX - 1).trim()}…`;
}

function ensureReviewKeyword(args: {
  seoTitle: string;
  language: string;
  articleType?: string | null;
}): string {
  const check = checkReviewSeoTitle({
    seoTitle: args.seoTitle,
    language: args.language,
    articleType: args.articleType,
  });
  if (!check.applies || check.ok) return args.seoTitle;
  const keyword = (args.language || '').toLowerCase().startsWith('en')
    ? 'review'
    : 'anmeldelse';
  const base = args.seoTitle.replace(/\s+/g, ' ').trim();
  const withKw = clampTitle(`${base} — ${keyword}`);
  const recheck = checkReviewSeoTitle({
    seoTitle: withKw,
    language: args.language,
    articleType: args.articleType,
  });
  return recheck.ok || !recheck.applies ? withKw : args.seoTitle;
}

/** Deterministic fallback when OpenAI is unavailable (tests / local). */
export function proposeArchiveSeoMetaHeuristic(args: {
  title: string;
  slug?: string;
  bodyText?: string;
  language: string;
  articleType?: string | null;
  oldSeoTitle?: string | null;
  oldMetaDescription?: string | null;
}): ArchiveSeoMetaProposal {
  const title = (args.title || args.slug || 'Artikel').trim();
  let seoTitle = clampTitle(args.oldSeoTitle?.trim() || title);
  seoTitle = ensureReviewKeyword({
    seoTitle,
    language: args.language,
    articleType: args.articleType,
  });

  const excerpt = (args.bodyText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  let meta =
    args.oldMetaDescription?.trim() ||
    (excerpt.length >= META_MIN
      ? excerpt
      : `${title}. Læs mere hos Apropos Magazine.`);
  meta = clampMeta(meta);
  if (meta.length < META_MIN) {
    meta = clampMeta(`${meta} ${excerpt}`.trim());
  }
  if (meta.length < META_MIN) {
    meta = clampMeta(
      `${title} — guide og perspektiv fra Apropos Magazine. Læs artiklen nu.`
    );
  }

  return {
    seoTitle,
    metaDescription: meta,
    articleTypeHint: args.articleType || null,
    mode: 'heuristic',
  };
}

function validateProposal(args: {
  seoTitle: string;
  metaDescription: string;
  language: string;
  articleType?: string | null;
}): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const title = args.seoTitle.trim();
  const meta = args.metaDescription.trim();
  if (!title) errors.push('seoTitle is empty');
  if (!meta) errors.push('metaDescription is empty');
  if (title.length > SEO_TITLE_MAX) errors.push(`seoTitle too long (${title.length})`);
  if (meta.length > META_MAX) errors.push(`metaDescription too long (${meta.length})`);
  if (meta.length < 40) errors.push('metaDescription too short');
  for (const p of findForbiddenPhrases(title)) {
    errors.push(`forbidden in title: ${p}`);
  }
  for (const p of findForbiddenPhrases(meta)) {
    errors.push(`forbidden in meta: ${p}`);
  }
  const review = checkReviewSeoTitle({
    seoTitle: title,
    language: args.language,
    articleType: args.articleType,
  });
  if (review.applies && !review.ok) {
    errors.push(`review_title_keyword_missing: ${review.message || 'mangler keyword'}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * Propose one seo-title + meta. Never requires strategy alternatives.
 */
export async function proposeArchiveSeoMeta(args: {
  title: string;
  slug?: string;
  bodyHtml?: string;
  language: string;
  articleType?: string | null;
  oldSeoTitle?: string | null;
  oldMetaDescription?: string | null;
  /** Inject for tests */
  completeFn?: (system: string, user: string) => Promise<string>;
  forceHeuristic?: boolean;
}): Promise<ArchiveSeoMetaProposal> {
  const bodyText = stripHtmlToText(args.bodyHtml || '').slice(0, 3500);
  const heuristic = () =>
    proposeArchiveSeoMetaHeuristic({
      title: args.title,
      slug: args.slug,
      bodyText,
      language: args.language,
      articleType: args.articleType,
      oldSeoTitle: args.oldSeoTitle,
      oldMetaDescription: args.oldMetaDescription,
    });

  if (args.forceHeuristic) {
    const h = heuristic();
    const v = validateProposal({
      seoTitle: h.seoTitle,
      metaDescription: h.metaDescription,
      language: args.language,
      articleType: args.articleType,
    });
    if (v.ok === false) {
      throw Object.assign(new Error(v.errors.join('; ')), { code: 'invalid_input' });
    }
    return h;
  }

  const system = [
    'Du skriver én SEO-title og én meta-description til Apropos Magazine.',
    'Svar KUN med JSON: {"seoTitle":"...","metaDescription":"..."}',
    'Ingen alternatives, ingen strategy pack, ingen ekstra felter.',
    `seoTitle max ${SEO_TITLE_MAX} tegn. metaDescription ${META_MIN}-${META_MAX} tegn.`,
    'Dansk tone når language=da. Ingen clickbait, ingen forbudte fraser.',
    'Hvis articleType er anmeldelse/review: seoTitle SKAL indeholde ordet anmeldelse (da) eller review (en).',
  ].join('\n');

  const user = JSON.stringify({
    language: args.language,
    articleType: args.articleType || null,
    title: args.title,
    slug: args.slug || null,
    oldSeoTitle: args.oldSeoTitle || null,
    oldMetaDescription: args.oldMetaDescription || null,
    excerpt: bodyText.slice(0, 1800),
  });

  try {
    let raw: string;
    if (args.completeFn) {
      raw = await args.completeFn(system, user);
    } else {
      const client = getOpenAIClient();
      if (!client) return heuristic();
      const completion = await client.chat.completions.create({
        model: models.default,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 400,
      });
      raw = completion.choices[0]?.message?.content || '';
    }

    const parsed = JSON.parse(raw) as { seoTitle?: string; metaDescription?: string };
    let seoTitle = clampTitle(String(parsed.seoTitle || '').trim());
    let metaDescription = clampMeta(String(parsed.metaDescription || '').trim());
    seoTitle = ensureReviewKeyword({
      seoTitle,
      language: args.language,
      articleType: args.articleType,
    });

    const v = validateProposal({
      seoTitle,
      metaDescription,
      language: args.language,
      articleType: args.articleType,
    });
    if (!v.ok) {
      // Soft fallback — still one proposal, never “fail closed alternatives”
      const h = heuristic();
      const hv = validateProposal({
        seoTitle: h.seoTitle,
        metaDescription: h.metaDescription,
        language: args.language,
        articleType: args.articleType,
      });
      if (hv.ok === false) {
        throw Object.assign(new Error(hv.errors.join('; ')), { code: 'invalid_input' });
      }
      return h;
    }

    return {
      seoTitle,
      metaDescription,
      articleTypeHint: args.articleType || null,
      mode: 'ai',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as { code?: string })?.code === 'invalid_input') throw err;
    // Parse/network → heuristic; never surface alternatives fail-closed
    if (/alternatives|Fail closed|strategy pack/i.test(msg)) {
      return heuristic();
    }
    const h = heuristic();
    const hv = validateProposal({
      seoTitle: h.seoTitle,
      metaDescription: h.metaDescription,
      language: args.language,
      articleType: args.articleType,
    });
    if (hv.ok === false) {
      throw Object.assign(new Error(hv.errors.join('; ')), {
        code: 'invalid_input',
        cause: err,
      });
    }
    return h;
  }
}
