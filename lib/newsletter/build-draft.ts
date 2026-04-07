import { getPreviousIsoWeekRange, type WeekRange } from '@/lib/newsletter/week-range';
import { fetchArticlesForWeek, MIN_NEWSLETTER_ARTICLES } from '@/lib/newsletter/webflow-sources';
import { generateNewsletterIntro } from '@/lib/newsletter/intro-ai';
import { introTextToHtml, renderNewsletterEmailHtml } from '@/lib/newsletter/render-html';
import { env } from '@/lib/config/env';

/** Når AI mangler eller fejler — så preview ikke er et tomt afsnit. */
const INTRO_FALLBACK_DA =
  'Vi har samlet udvalgte artikler nedenfor — fra de store titler til de små kulturstunder. God læselyst.';

const HEADLINE_FALLBACK_DA = 'Seneste fra Apropos';

export function newsletterSubject(week: WeekRange): string {
  return `Apropos Magazine · ${week.labelDa}`;
}

export type BuildDraftResult = {
  week: WeekRange;
  subject: string;
  html: string;
  headline: string;
  intro: string;
  articles: Awaited<ReturnType<typeof fetchArticlesForWeek>>['articles'];
  warnings: string[];
};

export async function buildWeeklyNewsletterDraft(params: {
  week?: WeekRange;
  introOverride?: string;
  skipAiIntro?: boolean;
  /** Sæt til request origin i draft-API så logo-PNG loader i iframe-preview (samme host som /public/images). */
  logoAssetBaseUrl?: string;
}): Promise<BuildDraftResult> {
  const week = params.week ?? getPreviousIsoWeekRange();
  const baseUrl = env.NEWSLETTER_ARTICLE_BASE_URL || 'https://www.aproposmagazine.com';

  const warnings: string[] = [];
  const { articles, error: artErr, minimumNote } = await fetchArticlesForWeek(week, baseUrl, {
    minimumArticles: MIN_NEWSLETTER_ARTICLES,
  });
  if (artErr) warnings.push(artErr);
  if (minimumNote) warnings.push(minimumNote);

  let intro = (params.introOverride || '').trim();
  let headline = '';
  let usedAiIntro = false;
  let introAiError: string | undefined;
  if (!intro && !params.skipAiIntro) {
    const gen = await generateNewsletterIntro(week, articles);
    intro = gen.intro.trim();
    headline = gen.headline.trim();
    usedAiIntro = Boolean(intro);
    introAiError = gen.error;
    if (gen.error) warnings.push(gen.error);
  }

  if (!intro) {
    intro = INTRO_FALLBACK_DA;
    if (params.skipAiIntro) {
      warnings.push('Intro-feltet er tomt — standardtekst bruges i mailen.');
    } else if (!usedAiIntro && !introAiError) {
      warnings.push('AI returnerede ingen tekst — standardtekst bruges i preview og ved send.');
    }
  }

  if (!headline) {
    headline = HEADLINE_FALLBACK_DA;
  }

  const introHtml = introTextToHtml(intro);
  const html = renderNewsletterEmailHtml({
    headline,
    introHtml,
    articles,
    siteUrl: baseUrl,
    logoAssetBaseUrl: params.logoAssetBaseUrl,
  });

  return {
    week,
    subject: newsletterSubject(week),
    html,
    headline,
    intro,
    articles,
    warnings,
  };
}
