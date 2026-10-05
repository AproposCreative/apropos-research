import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/image-gen/webflow', () => ({ readImageGenArticle: vi.fn() }));
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { submissionPreviewBlocks } from '@/lib/editorial/submission-preview';
const id = 'a'.repeat(64); let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => { memory = memoryFirestore(); state.db = memory.db; memory.rows.set(`editorialSubmissions/${id}`, { id, uid: 'owner', article: { title: 'Titel', content: 'Første afsnit.\n\nAndet afsnit.' } }); });
it('supports pasted text and keeps anchors when an unrelated paragraph is inserted', async () => {
  const first = await readImageGenSnapshot('owner', `submission-${id}`);
  expect(first.article.sections).toHaveLength(2);
  memory.rows.get(`editorialSubmissions/${id}`).article.content = 'Nyt afsnit.\n\nFørste afsnit.\n\nAndet afsnit.';
  const next = await readImageGenSnapshot('owner', `submission-${id}`);
  expect(next.article.sections[1].id).toBe(first.article.sections[0].id);
  await expect(readImageGenSnapshot('other', `submission-${id}`)).rejects.toThrow('unavailable');
});
it('returns non-executable preview blocks with body images at their actual position', () => {
  const blocks = submissionPreviewBlocks('<p>Før.</p><figure><img src="https://example.com/image.webp" alt="Billede"><figcaption>Foto: Navn</figcaption></figure><p>Efter.</p>');
  expect(blocks.map(x => x.kind)).toEqual(['text', 'image', 'text']);
  expect(blocks[1]).toMatchObject({ caption: 'Foto: Navn', alt: 'Billede' });
});
