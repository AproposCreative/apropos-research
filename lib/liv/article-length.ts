import { load } from 'cheerio';

/** Daily preparation only. Manual Writer length templates keep their own policy. */
export const LIV_DAILY_BODY_LENGTH = { min: 450, target: 550, max: 650 } as const;

export type LivArticleLength = {
  policy: 'liv-daily-body-v1';
  wordCount: number;
  min: 450;
  target: 550;
  max: 650;
  pass: boolean;
};

/** Count prose, not headings, captions, credits, attributes or embedded media.
 * Entity decoding and block boundaries must agree in preflight and correction. */
export function livBodyText(content: string): string {
  const $ = load(content || '');
  $('figure, figcaption, script, style, template, noscript, iframe, video, audio, img, h1, h2, h3, h4, h5, h6').remove();
  $('br').replaceWith(' ');
  $('p, div, li, blockquote, section, article, td, tr').append(' ');
  return $.root().text().replace(/\s+/gu, ' ').trim();
}

export function countLivBodyWords(content: string): number {
  return (livBodyText(content).match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || []).length;
}

export function checkLivArticleLength(content: string): LivArticleLength {
  const wordCount = countLivBodyWords(content);
  return { policy: 'liv-daily-body-v1', ...LIV_DAILY_BODY_LENGTH, wordCount,
    pass: wordCount >= LIV_DAILY_BODY_LENGTH.min && wordCount <= LIV_DAILY_BODY_LENGTH.max };
}
