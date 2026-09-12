export type LivArticleFormat = 'article' | 'research-review';

export function isLivArticleFormat(value: unknown): value is LivArticleFormat {
  return value === 'article' || value === 'research-review';
}

/** Fresh planning only: format selection is not evidence that a work was seen,
 * released, or deserves any particular rating. Those claims still need research. */
export function selectLivArticleFormat(input: {
  articleFormat?: LivArticleFormat;
  directiveHint?: string;
  expandedDirective?: string;
  topic: { title: string; category?: string; tags?: string[]; source?: { title: string; excerpt?: string; url?: string } };
}): LivArticleFormat {
  if (input.articleFormat) return input.articleFormat;
  const { topic } = input;
  const title = topic.title.trim();
  // Editorial intent wins over the format of a source used for research.
  const intent = `${input.directiveHint || ''} ${input.expandedDirective || ''} ${title}`;
  if (/(?:^|[^\p{L}])(?:feature|interview|nyhed(?:er|sartikel)?|news|analyse|analysis|essay|portræt|uden stjerner|ikke en anmeldelse)(?:$|[^\p{L}])/iu.test(intent)) return 'article';
  if (/trailer|casting|rollebesætning|annonceret|rygte|billetpris|vip|branche|kulturpolitik|får premiere|premieredato|på vej/iu.test(title)) return 'article';
  const screen = /(?:^|[^\p{L}])(?:film(?:en)?|dokumentar(?:en|film)?|tv[- ]?serie(?:n|r)?|serie(?:n|r)?)(?:$|[^\p{L}])/iu;
  const category = `${topic.category || ''} ${(topic.tags || []).join(' ')}`;
  const source = `${topic.source?.title || ''} ${(topic.source?.excerpt || '').slice(0, 1000)}`;
  const quoted = title.match(/["'‘’“”»«]([^"'‘’“”»«]{2,100})["'‘’“”»«]/u)?.[1];
  const named = quoted || title.split(/\s*:\s*/)[0];
  if (named.length < 2 || named.length > 100 || /[?]/.test(named) ||
    /^(?:film|serie|tv|hvorfor|hvordan|hvad|hvem|sådan|nye film|de bedste)(?:$|\s)/iu.test(named)) return 'article';
  // Incidental screen comparisons in a music story cannot establish its subject.
  const screenTopic = screen.test(category) || screen.test(title) ||
    ((!category.trim() || /^(?:kultur(?:\s*(?:&|og)\s*mening)?|culture)\s*$/iu.test(category)) &&
      screen.test(source) && source.toLocaleLowerCase('da').includes(named.toLocaleLowerCase('da')));
  if (!screenTopic) return 'article';
  const assessmentOrRelease = /anmeld(?:else|er|t)|review|biografaktuel|premiere|aktuelle? (?:film|serie)|nye? (?:film|serie|dokumentar)|nu i biografen|nu på (?:netflix|hbo|dr|tv 2)/iu;
  return assessmentOrRelease.test(`${title} ${source} ${topic.source?.url || ''}`) ? 'research-review' : 'article';
}

/** Rating is requested explicitly, never inferred from incidental words in the brief. */
export function parseResearchRating(raw: string, format: LivArticleFormat): { value: number; reason: string } | null {
  const ratings = [...raw.matchAll(/^\s*Rating\s*:\s*(.+)$/gim)];
  const reasons = [...raw.matchAll(/^\s*RatingReason\s*:\s*(.+)$/gim)];
  if (format === 'article') {
    if (ratings.length || reasons.length) throw new Error('unexpected_article_rating');
    return null;
  }
  const value = ratings[0]?.[1]?.trim();
  const reason = reasons[0]?.[1]?.trim() || '';
  if (ratings.length !== 1 || !/^[1-6]$/.test(value || '') || reasons.length !== 1 || reason.length < 30 || reason.length > 600) {
    throw new Error('research_rating_invalid: Stjerner kræver 1-6 og en konkret begrundelse.');
  }
  return { value: Number(value), reason };
}
