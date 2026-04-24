import type { GeneratedArticle } from '@/lib/liv/generate-article';
import {
  buildTopicsSelectedForCms,
  fotoCreditFromFeaturedUrl,
  suggestLocationLine,
} from '@/lib/liv/cms-webflow-meta';
import type { PickedTopic } from '@/lib/liv/pick-topic';
import type { WebflowArticleFields } from '@/lib/webflow/types';

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
}): WebflowArticleFields {
  const { article, topic } = input;
  const section = article.section || input.sectionFallback || 'Kultur';
  const status = normalizeStatus(input.status);
  const publishDate = new Date().toISOString();
  const wordCount = article.content.split(/\s+/).filter(Boolean).length;

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

  const thumbCandidate = article.imageSuggestions?.[0]?.url;
  const fotoCredit = fotoCreditFromFeaturedUrl(thumbCandidate);
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
    aiGenerated: true,
    aiSourceUrl: topic.source?.url || null,
    aiModel: input.aiModel || process.env.LIV_GENERATION_MODEL || 'claude-opus-4.7',
    featuredImage: thumbCandidate,
    ...(fotoCredit ? { fotoCredit } : {}),
    ...(locationLine ? { location: locationLine } : {}),
    imageSourceUrls: imageSourceUrlsFinal.length > 0 ? imageSourceUrlsFinal : undefined,
    topicsSelected: buildTopicsSelectedForCms(topic, article),
  };
}
