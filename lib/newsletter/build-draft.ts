import { getPreviousIsoWeekRange, type WeekRange } from '@/lib/newsletter/week-range';
import {
  fetchArticlesForWeek,
  MIN_NEWSLETTER_ARTICLES,
  type NewsletterArticle,
} from '@/lib/newsletter/webflow-sources';
import { getLastWeeklyAutoLeadArticleId } from '@/lib/newsletter/weekly-send-history';
import { generateNewsletterIntro, stripTypographicDashesForNewsletter } from '@/lib/newsletter/intro-ai';
import { introTextToHtml, renderNewsletterEmailHtml } from '@/lib/newsletter/render-html';
import { newsletterUtmCampaignFromWeek } from '@/lib/newsletter/newsletter-utm';
import { env } from '@/lib/config/env';

/** Når AI mangler eller fejler, så preview ikke er et tomt afsnit. */
const INTRO_FALLBACK_DA =
  'Vi har samlet udvalgte artikler nedenfor, fra de store titler til de små kulturstunder. God læselyst.';

/** Bruges når AI ikke giver overskrift; samme tekst som emnefelt (kun overskrift, ingen dato-linje). */
export const HEADLINE_FALLBACK_DA = 'Seneste fra Apropos';

export type BuildDraftResult = {
  week: WeekRange;
  subject: string;
  html: string;
  headline: string;
  intro: string;
  articles: NewsletterArticle[];
  warnings: string[];
};

/** Hvis seneste uges hero stadig er nyeste, flyt den til bunden så næste artikel bliver forside. */
function demotePreviousLead(articles: NewsletterArticle[], leadId: string | null | undefined): NewsletterArticle[] {
  if (!leadId || articles.length < 2) return articles;
  if (articles[0]?.id !== leadId) return articles;
  return [...articles.slice(1), articles[0]];
}

export type PreparedWeeklyArticles = {
  week: WeekRange;
  articles: NewsletterArticle[];
  articleError?: string;
  minimumNote?: string;
};

/** Hent, sortér og evt. demover forrige lead — bruges af draft-cache (hash) og `buildWeeklyNewsletterDraft`. */
export async function prepareWeeklyArticlesForDraft(params: {
  week?: WeekRange;
  referenceDate?: Date;
  excludeArticleIds?: Set<string>;
  relaxedExcludeArticleIds?: Set<string>;
  skipDemotePreviousLead?: boolean;
}): Promise<PreparedWeeklyArticles> {
  const week = params.week ?? getPreviousIsoWeekRange(params.referenceDate ?? new Date());
  const baseUrl = env.NEWSLETTER_ARTICLE_BASE_URL || 'https://www.aproposmagazine.com';
  const refDate = params.referenceDate ?? new Date();

  let { articles, error: artErr, minimumNote } = await fetchArticlesForWeek(week, baseUrl, {
    minimumArticles: MIN_NEWSLETTER_ARTICLES,
    excludeIds: params.excludeArticleIds,
    relaxedExcludeIds: params.relaxedExcludeArticleIds,
    referenceDate: refDate,
  });

  if (params.skipDemotePreviousLead !== true) {
    const prevLead = await getLastWeeklyAutoLeadArticleId();
    const before0 = articles[0]?.id;
    articles = demotePreviousLead(articles, prevLead);
    if (
      prevLead &&
      before0 === prevLead &&
      articles[0]?.id !== prevLead &&
      articles.length > 1
    ) {
      const note = 'Forrige uges forsideartikel er flyttet nederst, så ikke to uger i træk samme feature.';
      minimumNote = minimumNote ? `${minimumNote} ${note}` : note;
    }
  }

  return {
    week,
    articles,
    articleError: artErr,
    minimumNote,
  };
}

type ComposeWeeklyDraftParams = {
  week: WeekRange;
  articles: NewsletterArticle[];
  introOverride?: string;
  skipAiIntro?: boolean;
  logoAssetBaseUrl?: string;
  articleError?: string;
  minimumNote?: string;
};

/** Bygger selve draft-resultatet ud fra en allerede udvalgt artikelliste. */
export async function composeWeeklyNewsletterDraft(
  params: ComposeWeeklyDraftParams
): Promise<BuildDraftResult> {
  const week = params.week;
  const baseUrl = env.NEWSLETTER_ARTICLE_BASE_URL || 'https://www.aproposmagazine.com';

  const warnings: string[] = [];
  if (params.articleError) warnings.push(params.articleError);
  if (params.minimumNote) warnings.push(params.minimumNote);

  let intro = (params.introOverride || '').trim();
  let headline = '';
  let usedAiIntro = false;
  let introAiError: string | undefined;
  if (!intro && !params.skipAiIntro) {
    const gen = await generateNewsletterIntro(week, params.articles);
    intro = gen.intro.trim();
    headline = gen.headline.trim();
    usedAiIntro = Boolean(intro);
    introAiError = gen.error;
    if (gen.error) warnings.push(gen.error);
  }

  if (!intro) {
    intro = INTRO_FALLBACK_DA;
    if (params.skipAiIntro) {
      warnings.push('Intro-feltet er tomt; standardtekst bruges i mailen.');
    } else if (!usedAiIntro && !introAiError) {
      warnings.push('AI returnerede ingen tekst; standardtekst bruges i preview og ved send.');
    }
  }

  if (!headline) {
    headline = HEADLINE_FALLBACK_DA;
  }

  headline = stripTypographicDashesForNewsletter(headline).slice(0, 140);
  intro = stripTypographicDashesForNewsletter(intro);

  const introHtml = introTextToHtml(intro);
  const html = renderNewsletterEmailHtml({
    headline,
    introHtml,
    articles: params.articles,
    siteUrl: baseUrl,
    logoAssetBaseUrl: params.logoAssetBaseUrl,
    utmCampaign: newsletterUtmCampaignFromWeek(week),
  });

  return {
    week,
    subject: headline,
    html,
    headline,
    intro,
    articles: params.articles,
    warnings,
  };
}

export async function buildWeeklyNewsletterDraft(params: {
  week?: WeekRange;
  introOverride?: string;
  skipAiIntro?: boolean;
  /** Sæt til request origin i draft-API så logo-PNG loader i iframe-preview (samme host som /public/images). */
  logoAssetBaseUrl?: string;
  /** Auto-fredag: undgå artikel-id'er fra seneste sends (fuld + slækket liste). */
  excludeArticleIds?: Set<string>;
  relaxedExcludeArticleIds?: Set<string>;
  /** Øvre grænse for publicering i artikelvinduet (standard: nu). */
  referenceDate?: Date;
  /** Sæt true for at undgå Firestore-kald og flytning af forrige lead (tests). */
  skipDemotePreviousLead?: boolean;
}): Promise<BuildDraftResult> {
  const prepared = await prepareWeeklyArticlesForDraft({
    week: params.week,
    referenceDate: params.referenceDate,
    excludeArticleIds: params.excludeArticleIds,
    relaxedExcludeArticleIds: params.relaxedExcludeArticleIds,
    skipDemotePreviousLead: params.skipDemotePreviousLead,
  });

  return composeWeeklyNewsletterDraft({
    week: prepared.week,
    articles: prepared.articles,
    introOverride: params.introOverride,
    skipAiIntro: params.skipAiIntro,
    logoAssetBaseUrl: params.logoAssetBaseUrl,
    articleError: prepared.articleError,
    minimumNote: prepared.minimumNote,
  });
}
