import { createHash } from 'node:crypto';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export type EmbeddingArticle = { url?: string; title: string; content: string; author?: string; category?: string; date?: string };
export function embeddingInput(article: EmbeddingArticle): string {
  return `${article.title}\n\n${article.content || ''}`.replace(/\s+/g, ' ').trim().slice(0, 4000);
}
export function embeddingKey(article: EmbeddingArticle): string {
  return createHash('sha256').update(`${EMBEDDING_MODEL}\n${embeddingInput(article)}`).digest('hex');
}
export function validEmbedding(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 1536 && value.every(x => typeof x === 'number' && Number.isFinite(x));
}
export async function buildEmbeddingArchive(articles: EmbeddingArticle[], deps: {
  read: (key: string) => Promise<number[] | null>;
  generate: (key: string, input: string) => Promise<number[]>;
}) {
  if (!articles.length) throw new Error('empty_embedding_archive');
  const memo = new Map<string, number[]>();
  const ids = new Set<string>();
  const output = [];
  for (const article of articles) {
    if (!article.title?.trim() || !article.content?.trim()) throw new Error('invalid_embedding_article');
    const key = embeddingKey(article);
    const id = createHash('sha256').update(article.url || key).digest('hex');
    if (ids.has(id)) throw new Error('duplicate_embedding_article');
    ids.add(id);
    const embedding = memo.get(key) ?? await deps.read(key) ?? await deps.generate(key, embeddingInput(article));
    if (!validEmbedding(embedding)) throw new Error('invalid_embedding_vector');
    memo.set(key, embedding);
    output.push({ id, url: article.url, title: article.title, author: article.author, category: article.category,
      embedding, inputHash: key, model: EMBEDDING_MODEL, meta: { date: article.date } });
  }
  return output;
}
