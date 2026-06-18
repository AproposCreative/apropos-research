import type { WebflowArticleFields } from '@/lib/webflow/types';

export type ArticleWorkflowSource = 'ai-writer' | 'liv' | 'manual' | 'migration' | 'unknown';

export type ArticleWorkflowState =
  | 'idea'
  | 'draft'
  | 'ready_for_review'
  | 'webflow_draft'
  | 'published'
  | 'distributed';

export type ArticlePayload = WebflowArticleFields & {
  source?: ArticleWorkflowSource;
  workflowState?: ArticleWorkflowState;
  sourceArticleId?: string;
  /** Legacy UI alias for `category`; normalized before Webflow mapping. */
  section?: string;
};

export type NormalizeArticlePayloadOptions = {
  source?: ArticleWorkflowSource;
  defaultStatus?: WebflowArticleFields['status'];
  defaultAuthor?: string;
  defaultCategory?: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
    .replace(/^-|-$/g, '');
}

function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function resolveWorkflowState(status: WebflowArticleFields['status']): ArticleWorkflowState {
  if (status === 'published') return 'published';
  return 'webflow_draft';
}

export function normalizeArticlePayload(
  input: Partial<ArticlePayload> & Pick<WebflowArticleFields, 'title' | 'content'>,
  options: NormalizeArticlePayloadOptions = {}
): ArticlePayload {
  const content = String(input.content || '');
  const wordCount = input.wordCount || countWords(content);
  const status = input.status || options.defaultStatus || 'draft';
  const author = input.author || options.defaultAuthor || '';
  const source = input.source || options.source || 'unknown';
  const aiGenerated =
    input.aiGenerated ??
    (source === 'liv' ||
      !!input.aiModel ||
      !!input.aiSourceUrl ||
      /liv\s*brandt/i.test(author));

  return {
    id: input.id || `article-${Date.now().toString(36)}`,
    webflowId: input.webflowId,
    title: input.title,
    slug: input.slug || slugify(input.title),
    subtitle: input.subtitle,
    content,
    excerpt: input.excerpt,
    intro: input.intro,
    category: input.category || input.section || options.defaultCategory || '',
    tags: Array.isArray(input.tags) ? input.tags : [],
    author,
    rating: input.rating,
    featuredImage: input.featuredImage,
    gallery: input.gallery,
    publishDate: input.publishDate || new Date().toISOString(),
    status,
    seoTitle: input.seoTitle || input.title,
    seoDescription: input.seoDescription || input.excerpt || '',
    readTime: input.readTime || Math.max(1, Math.ceil(wordCount / 200)),
    wordCount,
    featured: input.featured,
    trending: input.trending,
    presseakkreditering: input.presseakkreditering ?? input.press ?? null,
    press: input.press ?? input.presseakkreditering ?? null,
    aiGenerated,
    aiSourceUrl: input.aiSourceUrl ?? null,
    imageSourceUrls: input.imageSourceUrls,
    aiModel: input.aiModel ?? null,
    fotoCredit: input.fotoCredit,
    location: input.location,
    topicsSelected: input.topicsSelected,
    streaming_service: input.streaming_service || input.platform,
    platform: input.platform || input.streaming_service,
    watchUrl: input.watchUrl,
    streamingUrl: input.streamingUrl,
    videoTrailer: input.videoTrailer || input.video_trailer,
    video_trailer: input.video_trailer || input.videoTrailer,
    source,
    workflowState: input.workflowState || resolveWorkflowState(status),
    sourceArticleId: input.sourceArticleId,
  };
}

export function toWebflowArticleFields(payload: ArticlePayload): WebflowArticleFields {
  const { source, workflowState, sourceArticleId, ...webflowFields } = payload;
  return webflowFields;
}
