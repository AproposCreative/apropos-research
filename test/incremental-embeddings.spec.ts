import { expect, it, vi } from 'vitest';
import { buildEmbeddingArchive, embeddingKey } from '../lib/incremental-embeddings';
const article = { url: 'https://example.com/article', title: 'Titel', content: 'Indhold' };
const vector = Array(1536).fill(0.1);
it('does not call a model for unchanged content', async () => {
  const generate = vi.fn();
  expect((await buildEmbeddingArchive([article], { read: async () => vector, generate })).length).toBe(1);
  expect(generate).not.toHaveBeenCalled();
});
it('hashes exact bounded input and invalidates changed text', () => {
  expect(embeddingKey(article)).not.toBe(embeddingKey({ ...article, content: 'Ændret' }));
  expect(embeddingKey(article)).toBe(embeddingKey({ ...article, author: 'Ny metadata' }));
});
it('fails the archive on invalid vectors rather than returning partial success', async () => {
  await expect(buildEmbeddingArchive([article], { read: async () => null, generate: async () => [] })).rejects.toThrow('invalid_embedding_vector');
  await expect(buildEmbeddingArchive([], { read: async () => null, generate: vi.fn() })).rejects.toThrow();
});
