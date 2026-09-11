import type { LivArticleFormat } from './review-format';

/** Separate subject and angle. Only an explicitly requested review seeks reviews. */
export function livResearchQueries(title: string, format: LivArticleFormat = 'article'): [string, string] {
  // Do not truncate real work titles such as "Star Wars: A New Hope".
  const subject = title.trim().split(/(?:\s+[–—]\s+|:\s+)(?=(?:når|hvorfor|hvordan|hvad|derfor)\b)/iu)[0].trim().slice(0, 180);
  if (!subject) throw new Error('research_query_missing');
  return [
    `${subject} official source statement programme credits`,
    format === 'research-review'
      ? `${subject} independent review criticism context`
      : `${subject} independent journalism interview background context`,
  ];
}
