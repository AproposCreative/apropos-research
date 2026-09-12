import { expect, it } from 'vitest';
import { checkLivArticleLength, countLivBodyWords } from '@/lib/liv/article-length';
import { checkCmsDraft } from '@/lib/editorial/cms-preflight';
import type { GeneratedArticle } from '@/lib/liv/generate-article';

const words = (count: number) => Array(count).fill('kultur').join(' ');
it.each([[449, false], [450, true], [550, true], [650, true], [651, false], [845, false], [1050, false]])(
  'enforces %i body words without the old 130 percent tolerance', (count, pass) => {
    expect(checkLivArticleLength(`<p>${words(Number(count))}</p>`)).toMatchObject({ wordCount: count, pass, min: 450, max: 650, target: 550 });
  });
it('excludes media, captions, headings and script text, but decodes entities and separates adjacent blocks', () => {
  const content = `<h2>${words(30)}</h2><p>København&nbsp;har <strong>kant</strong>.</p><p>AI-kunst er spændende.</p>
    <figure><img alt="${words(20)}" src="image.jpg"><figcaption>${words(200)}</figcaption></figure>
    <script>${words(40)}</script><style>${words(40)}</style><iframe>${words(40)}</iframe>`;
  expect(countLivBodyWords(content)).toBe(6);
  expect(countLivBodyWords('<p>Ét</p><p>to<br>tre</p>')).toBe(3);
  expect(countLivBodyWords('<p>kul<strong>tur</strong> &amp; musik</p>')).toBe(2);
});
it('uses the exact daily policy explicitly while preserving manual Writer long-template tolerance', () => {
  const article = { content: `<p>${words(800)}</p>`, researchSources: [] } as unknown as GeneratedArticle;
  expect(checkCmsDraft(article, 'liv-daily').checks.find(check => check.id === 'length')?.ok).toBe(false);
  expect(checkCmsDraft(article, 1000).checks.find(check => check.id === 'length')?.ok).toBe(true);
  article.content = `<p>${words(550)}</p><figure><figcaption>${words(500)}</figcaption></figure>`;
  expect(checkCmsDraft(article, 'liv-daily')).toMatchObject({ wordCount: 550, readTime: 3, publicationReady: false });
  expect(checkCmsDraft(article, 'liv-daily').checks.find(check => check.id === 'length')?.ok).toBe(true);
});
