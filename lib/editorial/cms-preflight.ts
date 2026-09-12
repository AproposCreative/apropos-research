import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { checkLivArticleLength } from '@/lib/liv/article-length';

export type CmsPreflight = {
  checkedAt: string;
  structureReady: boolean;
  publicationReady: false;
  checks: { id: string; label: string; ok: boolean }[];
  wordCount: number;
  readTime: number;
};

/** Structural checks only. Never claims that sources, rights or live CMS references are verified. */
export function checkCmsDraft(article: GeneratedArticle, targetWordCount: number | 'liv-daily' = 1000): CmsPreflight {
  const text = (article.content || '').replace(/<[^>]*>/g, ' ').trim();
  const dailyLength = targetWordCount === 'liv-daily' ? checkLivArticleLength(article.content) : null;
  const wordCount = dailyLength ? dailyLength.wordCount : text ? text.split(/\s+/u).length : 0;
  const checks = [
    { id: 'title', label: 'Titel uden pladsholder', ok: !!article.title?.trim() && !/arbejdstitel|indsæt titel/i.test(article.title) },
    { id: 'slug', label: 'Gyldig slug', ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug || '') },
    { id: 'intro', label: 'Undertitel og intro', ok: !!article.subtitle?.trim() && !!article.intro?.trim() },
    { id: 'seo', label: 'SEO-titel og metabeskrivelse', ok: !!article.seoTitle?.trim() && !!article.seoDescription?.trim() },
    { id: 'category', label: 'Kategori angivet', ok: !!article.section?.trim() },
    { id: 'length', label: dailyLength ? '450–650 ord i brødteksten, uden billedtekster' : 'Længde inden for 75-130 % af brief',
      ok: dailyLength ? dailyLength.pass : wordCount >= Number(targetWordCount) * 0.75 && wordCount <= Number(targetWordCount) * 1.3 },
    { id: 'style', label: 'Ingen em dash i artikeltekst', ok: !/[—]/.test([article.title, article.subtitle, article.intro, text].join(' ')) },
    { id: 'sources', label: 'Mindst to kilde-URL’er registreret, ikke verificeret', ok: new Set((article.researchSources || []).map(s => s.url).filter(url => typeof url === 'string' && /^https?:\/\//.test(url))).size >= 2 },
  ];
  return { checkedAt: new Date().toISOString(), structureReady: checks.every(check => check.ok), publicationReady: false, checks, wordCount, readTime: Math.max(1, Math.ceil(wordCount / 200)) };
}
