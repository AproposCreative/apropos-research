import { z } from 'zod';
import { load } from 'cheerio';
import { editableArticle, researchSchema } from '@/lib/mcp/workspace';
import { assertArticleMarkupSafe, articleImages } from '@/lib/mcp/markup';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

export const submissionId = z.string().regex(/^[a-f0-9]{64}$/);
export const submissionChoices = z.object({
  kind: z.enum(['review', 'news', 'feature', 'commentary']).optional(),
  media: z.enum(['press', 'illustration', 'provided']).optional(),
  style: z.enum(['expressive', 'minimal']).default('expressive'),
}).strict();
export const submissionInput = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/),
  article: editableArticle,
  research: researchSchema.default([]),
  choices: submissionChoices.default({ style: 'expressive' }),
}).strict();
export const submissionUpdate = z.object({
  submissionId, expectedRevision: z.number().int().positive(),
  requestId: submissionInput.shape.requestId,
  article: editableArticle.partial().optional(),
  research: researchSchema.optional(), choices: submissionChoices.partial().optional(),
  clearFields: z.array(z.enum(['rating', 'ratingReason', 'articleFormat'])).max(3).optional(),
}).strict();
export type SubmissionInput = z.infer<typeof submissionInput>;
export type SubmissionArticle = SubmissionInput['article'];
export type SubmissionOptions = {
  authors: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string }>;
  requiredFields: string[];
  checkedAt: string;
};
export type SubmissionQuestion = { field: string; question: string; options?: Array<{ value: string; label: string }> };
export type SubmissionRecord = SubmissionInput & {
  executionPolicy?: 'chat-final-checks-v1';
  id: string; uid: string; revision: number; originalArticle: SubmissionArticle;
  contentHash: string; createdAt: string; updatedAt: string;
  status: 'draft' | 'awaiting_answers' | 'awaiting_preparation' | 'processing' | 'blocked' | 'prepared' | 'scheduled' | 'published';
};

export function validateSubmissionArticle(article: SubmissionArticle) {
  for (const text of [article.content, article.title, article.subtitle, article.intro, article.excerpt]) {
    if (text !== undefined) assertArticleMarkupSafe(text);
  }
  if (!article.title.trim() || !load(article.content).root().text().trim()) throw Error('mcp_submission_empty_article');
}

/** Suggestions and missing input only. No guessed authorship, rating, approval or new prose. */
export function inspectSubmission(input: Pick<SubmissionInput, 'article' | 'choices' | 'research'>, options: SubmissionOptions) {
  const { article, choices } = input;
  validateSubmissionArticle(article);
  const questions: SubmissionQuestion[] = [];
  const question = (field: string, text: string, values?: Array<{ id: string; name: string }>) =>
    questions.push({ field, question: text, ...(values ? { options: values.map(v => ({ value: v.id, label: v.name })) } : {}) });
  const review = choices.kind === 'review' || (!choices.kind && article.articleFormat === 'research-review');
  const film = ['film', 'tv-series'].includes(article.subjectType || '');
  if (!choices.kind && article.articleFormat !== 'research-review') question('kind', 'Er det en anmeldelse, nyhed, feature eller kommentar?',
    [{ id: 'review', name: 'Anmeldelse' }, { id: 'news', name: 'Nyhed' }, { id: 'feature', name: 'Feature' }, { id: 'commentary', name: 'Kommentar' }]);
  if (!options.authors.some(a => a.id === article.author || a.name === article.author)) question('author', 'Hvem skal stå som forfatter?', options.authors);
  if (!options.categories.some(c => c.id === article.category || c.name === article.category)) question('category', 'Hvilken kategori skal artiklen have?', options.categories);
  if (!article.subjectType) question('subjectType', 'Hvad handler artiklen om?',
    [{ id: 'film', name: 'Film' }, { id: 'tv-series', name: 'Tv-serie' }, { id: 'music', name: 'Musik/koncert' },
      { id: 'literature', name: 'Litteratur' }, { id: 'art', name: 'Kunst' }, { id: 'culture', name: 'Øvrig kultur' }]);
  if (review && article.rating === undefined) question('rating', 'Hvor mange stjerner giver du den?',
    Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), name: `${i + 1}/6 stjerner` })));
  if (review && !article.ratingReason?.trim()) question('ratingReason', 'Hvad begrunder bedømmelsen? Brug din vurdering fra teksten.');
  if (!choices.media && !film) question('media', 'Skal vi finde pressefotos, lave Apropos-illustrationer eller bruge dine billeder?',
    [{ id: 'press', name: 'Pressefotos' }, { id: 'illustration', name: 'Apropos-illustrationer' }, { id: 'provided', name: 'Mine billeder' }]);
  const blockers: string[] = [];
  if (!options.authors.length || !options.categories.length) blockers.push('cms_options_unavailable');
  if (film && choices.media === 'illustration') blockers.push('film_requires_real_stills');
  if (choices.kind && choices.kind !== 'review' && (article.rating !== undefined || article.articleFormat === 'research-review')) blockers.push('non_review_has_review_fields');
  if (choices.kind === 'review' && article.articleFormat === 'article') blockers.push('review_format_conflict');
  if (article.topicsSelected?.some(id => !options.topics.some(topic => topic.id === id))) blockers.push('unknown_topic');
  const missingMetadata = (['subtitle', 'intro', 'slug', 'seoTitle', 'seoDescription'] as const).filter(key => !article[key]?.trim());
  const images = articleImages(article.content);
  const distinctBodyImages = new Set(images.map(i => i.url).filter(url => url !== article.featuredImage)).size;
  const missingMedia = [...(!article.featuredImage ? ['cover'] : []),
    ...Array.from({ length: Math.max(0, 2 - distinctBodyImages) }, (_, i) => `body-${distinctBodyImages + i + 1}`)];
  return { questions: questions.slice(0, 3), remainingQuestionCount: Math.max(0, questions.length - 3),
    missingMetadata, missingMedia, blockers, suggestedMedia: film ? 'press' : choices.media || 'press',
    readyForPreparation: !questions.length && !blockers.length && !missingMetadata.length,
    publicationReady: false as const, textPreserved: true, paidAiCalls: 0,
    instruction: 'Vis foreslåede valg og stil kun de returnerede spørgsmål. Bevar brødteksten. Udfyld manglende metadata i chatten uden nye fakta. En kladde er ikke publiceringsklar.' };
}

export function submissionVersion(input: Pick<SubmissionInput, 'article' | 'choices' | 'research'>) {
  return cmsFieldHash({ article: input.article, choices: input.choices, research: input.research });
}
