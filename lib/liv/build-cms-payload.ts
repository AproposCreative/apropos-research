import type { GeneratedArticle } from '@/lib/liv/generate-article';
import type { ArticlePayload } from '@/lib/articles/article-payload';
import {
  buildTopicsSelectedForCms,
  suggestLocationLine,
} from '@/lib/liv/cms-webflow-meta';
import type { PickedTopic } from '@/lib/liv/pick-topic';
import { parseResearchRating } from '@/lib/liv/review-format';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { countLivBodyWords } from '@/lib/liv/article-length';

function articleIdFromSlug(slug: string): string {
  return `liv-daily-${slug}-${Date.now().toString(36)}`.slice(0, 80);
}

function normalizeStatus(raw?: string): 'draft' | 'published' {
  return raw?.trim().toLowerCase() === 'published' ? 'published' : 'draft';
}

export function buildLivCmsPayload(input: {
  article: GeneratedArticle;
  topic: PickedTopic;
  sectionFallback?: string;
  status?: string;
  aiModel?: string;
}): ArticlePayload {
  const { article, topic } = input;
  if (article.articleFormat === 'research-review') {
    parseResearchRating(`Rating: ${article.rating}\nRatingReason: ${article.ratingReason || ''}`, 'research-review');
  } else if (article.rating !== undefined) {
    throw new Error('unexpected_article_rating');
  }
  const section = article.section || input.sectionFallback || 'Kultur';
  const status = normalizeStatus(input.status);
  const publishDate = new Date().toISOString();
  const wordCount = countLivBodyWords(article.content);

  const imageSourceUrls: string[] = [];
  const pushUrl = (u?: string | null) => {
    if (!u || typeof u !== 'string' || !/^https?:\/\//i.test(u)) return;
    const t = u.trim();
    if (imageSourceUrls.includes(t)) return;
    imageSourceUrls.push(t);
  };
  pushUrl(topic.source?.url);
  for (const r of article.researchSources || []) {
    pushUrl(r.url);
  }
  const imageSourceUrlsFinal = imageSourceUrls.slice(0, 12);

  const selectedImage = article.selectedImage;
  if (selectedImage && selectedImage.articleHash !== livImageArticleHash(article)) throw new Error('image_article_changed');
  const thumbCandidate = selectedImage?.url;
  const fotoCredit = selectedImage?.credit;
  const locationLine = suggestLocationLine(topic, article);

  return {
    id: articleIdFromSlug(article.slug),
    title: article.title,
    slug: article.slug,
    subtitle: article.subtitle,
    content: article.content,
    intro: article.intro,
    excerpt: article.excerpt,
    category: section,
    tags: article.tags || [],
    author: 'Liv Brandt',
    seoTitle: article.seoTitle || article.title,
    seoDescription: article.seoDescription || article.excerpt || '',
    status,
    publishDate,
    readTime: Math.max(1, Math.ceil(wordCount / 200)),
    wordCount,
    presseakkreditering: false,
    // Public CMS label is disabled by editorial choice; model/source provenance remains below.
    aiGenerated: false,
    articleFormat: article.articleFormat || 'article',
    ...(article.subjectType ? { subjectType: article.subjectType } : {}),
    ...(article.rating !== undefined ? { rating: article.rating, ratingReason: article.ratingReason } : {}),
    aiSourceUrl: topic.source?.url || null,
    aiModel: article.aiModel || input.aiModel || null,
    featuredImage: thumbCandidate,
    featuredImageAlt: selectedImage?.alt,
    featuredImageHash: selectedImage?.contentHash,
    ...(fotoCredit ? { fotoCredit } : {}),
    ...(locationLine ? { location: locationLine } : {}),
    imageSourceUrls: imageSourceUrlsFinal.length > 0 ? imageSourceUrlsFinal : undefined,
    topicsSelected: buildTopicsSelectedForCms(topic, article),
    source: 'liv',
    workflowState: status === 'published' ? 'published' : 'webflow_draft',
  };
}
