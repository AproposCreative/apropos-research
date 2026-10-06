import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
import { getChatImageBrief } from '@/lib/editorial/chat-image-brief';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { buildAproposImagePrompt } from '@/lib/image-gen/prompt';
import { readImageGenStyleConfig } from '@/lib/image-gen/style-config';
const id = 'a'.repeat(64), path = `editorialSubmissions/${id}`;
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => {
  memory = memoryFirestore(); state.db = memory.db;
  memory.rows.set(path, { id, uid: 'team', revision: 1, contentHash: 'b'.repeat(64), status: 'draft', research: [],
    article: { title: 'Scenen med aben', subjectType: 'music', content: '<p>En stor abe var bygget som dekoration på scenen.</p>' } });
});
async function input() {
  const { article } = await readImageGenSnapshot('team', `submission-${id}`);
  return { submissionId: id, expectedRevision: 1, sectionId: article.sections[0].id,
    excerpt: article.sections[0].text, description: 'En stiliseret scene med en stor abe som dekoration.', role: 'cover', style: 'expressive' };
}
it('exports the same canonical prompt as server generation, actual reference bytes and stable retained identity', async () => {
  const value = await input(), first = await getChatImageBrief('team', value), second = await getChatImageBrief('team', value);
  expect(first.brief.prompt).toBe(buildAproposImagePrompt({ config: await readImageGenStyleConfig(), style: 'expressive',
    title: 'Scenen med aben', passage: value.excerpt, description: value.description }));
  expect(first.brief.briefId).toBe(second.brief.briefId); expect(first.brief.paidAiCalls).toBe(0);
  expect(Buffer.from(first.reference.data, 'base64').length).toBeGreaterThan(1000);
  expect(first.reference.mimeType).toBe('image/jpeg');
  expect(first.brief.visualEvidence.status).toBe('not_server_verified');
});
it('rejects invented scenes, another user, changed text, film stills and nonexistent edit references', async () => {
  const value = await input();
  await expect(getChatImageBrief('other', value)).rejects.toThrow('not_found');
  await expect(getChatImageBrief('team', { ...value, excerpt: 'En løve hoppede ud til publikum.' })).rejects.toThrow('anchor_changed');
  await expect(getChatImageBrief('team', { ...value, expectedRevision: 2 })).rejects.toThrow('revision_conflict');
  await expect(getChatImageBrief('team', { ...value, editInstruction: 'Remove hat' })).rejects.toThrow('parent_required');
  memory.rows.get(path).article.subjectType = 'film';
  await expect(getChatImageBrief('team', value)).rejects.toThrow('film_requires_real_stills');
});
