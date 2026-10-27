/** Owner's editorial direction, 2026-10-27. This changes selection, not spend or consent. */
export const LIV_EDITORIAL_REMIT_VERSION = 'liv-reviews-guides-2026-10-27-v1';
export const LIV_EDITORIAL_REMIT = {
  version: LIV_EDITORIAL_REMIT_VERSION,
  formats: ['research-review', 'culture-guide'],
  subjects: ['concerts', 'tv-series', 'film', 'books', 'museums', 'exhibitions', 'cultural-experiences'],
  excluded: ['news', 'breaking-news', 'recruitment', 'industry-news', 'celebrity-news', 'announcements'],
  reviewSources: { minimum: 5, target: 6, originalReviews: true, actuallyRead: true },
  publicAiLabel: true,
  instruction: 'Liv laver anmeldelser og konkrete kulturguider: koncerter, tv-serier, film, bøger, museer, udstillinger og kulturoplevelser. ' +
    'Ingen nyheder, praktikant-/jobopslag, branchehistorier, kendisstof, annonceringer eller jagt på at være først. ' +
    'En researchanmeldelse er udtrykkeligt tilladt uden egen visning, læsning eller tilstedeværelse: læs 5–6 selvstændige originalanmeldelser af samme værk, sæson eller koncert, ' +
    'sammenhold konkrete styrker, svagheder og uenighed, og skriv en selvstændig sammenfattende vurdering i Livs stemme med begrundede 1–6 stjerner. ' +
    'Bevar links og attribution. En opsamling, pressemeddelelse eller søgesnippet tæller ikke som en læst originalanmeldelse. Opfind ikke fremmøde, læsning, citater eller scener. ' +
    'Gem hver læst anmeldelse i research med kind=review, dato og konkrete noter; registrér officielle praktiske kilder med kind=official. ' +
    'Markér researchanmeldelser offentligt som AI: article.aiGenerated=true samt en kort synlig sætning om kildegrundlaget i teksten. ' +
    'Brug choices.kind=review/articleFormat=research-review eller choices.kind=culture-guide/articleFormat=article. Kulturguider hjælper læseren med konkrete valg, steder, datoer og praktiske oplysninger; ingen stjerner. ' +
    'Hvis anmeldelsesgrundlaget mangler, behold emnet som research eller vælg et andet relevant værk. Omdøb det ikke til nyhed eller feature. ' +
    'Ældre tekster og kilder bevares; en ny retning gør dem ikke automatisk godkendte. Ingen ændring af budget, betalingsstop, kalender eller personlig udgivelsesgodkendelse.',
} as const;

type Topic = { title: string; category?: string; tags?: string[]; url?: string; kind?: string; articleFormat?: string; angle?: string };
export type LivRemitAssessment = { version: string; eligible: boolean; format: 'research-review' | 'culture-guide' | null;
  reason: 'within_remit' | 'news_or_recruitment' | 'review_or_guide_required' };

/** Conservative eligibility screen, not semantic verification or permission to publish. */
export function assessLivTopic(topic: Topic): LivRemitAssessment {
  const result = (format: LivRemitAssessment['format'], reason: LivRemitAssessment['reason']): LivRemitAssessment =>
    ({ version: LIV_EDITORIAL_REMIT_VERSION, eligible: !!format, format, reason });
  const title = topic.title.normalize('NFKC').toLocaleLowerCase('da');
  const recruitment = /praktikant|praktikplads|jobopslag|stilling ledig|søger (?:en |ny |nye )?(?:redaktør|skribent|journalist|medarbejder|video)|we.?re hiring|internship/iu;
  const news = /(?:^|\W)(?:breaking|nyheder?|news)(?:$|\W)|(?:annoncerer|annonceret|genopliver|aflyst|aflyser|benægter|anklager|rekord|monolog|krig er brudt ud)|(?:spiller|vender tilbage).*(?:næste år|nye afsnit)|søger videopraktikant/iu;
  if (recruitment.test(title) || topic.kind === 'news' || topic.kind === 'short-news') return result(null, 'news_or_recruitment');
  // An explicit review can discuss a work about war, rumours or recruitment.
  const explicitReview = topic.kind === 'review' || topic.articleFormat === 'research-review' || /^anmeldelse\s*:/iu.test(title);
  const review = topic.kind === 'review' || topic.articleFormat === 'research-review' ||
    /(?:^|\W)(?:anmeldelse|anmeldelser|review|reviews)(?:$|\W)/iu.test(`${title} ${topic.category || ''} ${(topic.tags || []).join(' ')}`) ||
    /\/(?:anmeldelser?|reviews?)(?:\/|-)/iu.test(topic.url || '');
  const guide = topic.kind === 'culture-guide' || /^på radaren:/iu.test(title) || /(?:^|\W)(?:kulturguide|guide|streaming.?tip|museumsguide|koncertguide|bogguide)(?:$|\W)/iu.test(`${title} ${topic.angle || ''}`);
  if (!explicitReview && news.test(title)) return result(null, 'news_or_recruitment');
  return review ? result('research-review', 'within_remit') : guide ? result('culture-guide', 'within_remit') : result(null, 'review_or_guide_required');
}

export function livReviewSourceEvidence(sources: Array<{ url: string; kind?: string; notes?: string }>) {
  const hosts = new Set<string>(), urls = new Set<string>();
  for (const source of sources) {
    if (source.kind !== 'review' || (source.notes || '').trim().length < 80) continue;
    try {
      const url = new URL(source.url); url.hash = ''; url.search = '';
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (!['http:', 'https:'].includes(url.protocol) || !host) continue;
      urls.add(`${host}${url.pathname.replace(/\/$/, '')}`); hosts.add(host);
    } catch { /* Invalid URLs cannot count as evidence. */ }
  }
  // This is saved, agent-reported evidence, not proof the server read the sources.
  return { reviewCount: urls.size, independentHosts: hosts.size,
    sufficient: urls.size >= 5 && hosts.size >= 5, verification: 'agent_reported' as const };
}
