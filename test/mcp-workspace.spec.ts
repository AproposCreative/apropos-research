import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const fake = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => fake.db }));
import { saveMcpDraft } from '@/lib/mcp/workspace';
import { assertArticleMarkupSafe } from '@/lib/mcp/markup';
const memory = memoryFirestore(), uid = 'frederik';
beforeEach(() => { memory.clear(); fake.db = memory.db; });
const input = { draftId: 'draft-12345678', expectedRevision: 0, article: { title: 'En personlig anmeldelse', content: '<p>God tekst.</p>' } };
it('shares the private Writer workspace and marks ChatGPT sources unverified', async () => {
  const result = await saveMcpDraft(uid, { ...input, research: [{ url: 'https://www.dr.dk/kultur/test', title: 'Kilde', retrievedAt: '2026-10-04T12:00:00Z', publishedAt: null, notes: 'Konkret støtte' }] });
  expect(result).toMatchObject({ revision: 1, publicationApproval: false });
  expect(memory.rows.get(`writerWorkspaces/${uid}`).data.articleData.mcpResearch).toMatchObject({ verified: false, suppliedBy: 'chatgpt' });
  expect(memory.rows.has('writerWorkspaces/casper')).toBe(false);
});
it('replays a duplicate save without overwriting newer work', async () => {
  await saveMcpDraft(uid, input); await saveMcpDraft(uid, { ...input, expectedRevision: 1, article: { ...input.article, title: 'Ny version' } });
  expect(await saveMcpDraft(uid, input)).toMatchObject({ revision: 1, replay: true, currentRevision: 2 });
  expect(memory.rows.get(`writerWorkspaces/${uid}`).data.chatTitle).toBe('Ny version');
  expect(memory.rows.get(`writerWorkspaces/${uid}/history/1`).data.chatTitle).toBe(input.article.title);
});
it('preserves both sides of a simultaneous editing conflict', async () => {
  const results = await Promise.all([saveMcpDraft(uid, input), saveMcpDraft(uid, { ...input, article: { ...input.article, title: 'Anden tekst' } })]);
  expect(results.filter(r => r.conflict)).toHaveLength(1); expect(memory.rows.get(`writerWorkspaces/${uid}`).revision).toBe(1);
  expect([...memory.rows.keys()].filter(k => k.includes('/conflicts/'))).toHaveLength(1);
});
it('archives prior work when changing article and keeps unrelated article fields', async () => {
  await saveMcpDraft(uid, input);
  memory.rows.get(`writerWorkspaces/${uid}`).data.articleData.existingImages = ['unchanged'];
  await saveMcpDraft(uid, { ...input, expectedRevision: 1 });
  expect(memory.rows.get(`writerWorkspaces/${uid}`).data.articleData.existingImages).toEqual(['unchanged']);
  await saveMcpDraft(uid, { ...input, draftId: 'different-article', expectedRevision: 2 });
  expect(memory.rows.get(`writerWorkspaces/${uid}/history/2`).data.articleData.existingImages).toEqual(['unchanged']);
});
it.each([{ uid: 'casper' }, { article: { ...input.article, webflowId: 'a'.repeat(24) } }, { article: { ...input.article, publicationApproval: true } }, { article: { ...input.article, rating: 4.5 } }])('rejects identity/approval injection or invalid editorial input %j', async value => {
  await expect(saveMcpDraft(uid, { ...input, ...value })).rejects.toThrow(); expect(memory.rows.size).toBe(0);
});
it('rejects credential-bearing evidence URLs', async () => {
  await expect(saveMcpDraft(uid, { ...input, research: [{ url: 'https://source.example?api_key=secret', title: '', retrievedAt: '2026-10-04T12:00:00Z', publishedAt: null, notes: '' }] })).rejects.toThrow();
});
it.each(['<script>alert(1)</script>', '<img src="https://example.com/a" onerror="alert(1)">', '<a href="java&#x09;script:alert(1)">X</a>', '<iframe src="https://evil.example"></iframe>', '<p style="background:url(https://example.com)">Text</p>'])('rejects executable imported markup %s', html => {
  expect(() => assertArticleMarkupSafe(html)).toThrow('mcp_unsafe_article_markup');
});
it('allows ordinary semantic editorial HTML and HTTPS assets', () => {
  expect(() => assertArticleMarkupSafe('<h2>Refleksion</h2><p><em>Tekst</em> og <a href="https://source.example/">kilde</a>.</p><figure><img src="https://source.example/1.jpg" alt="Motiv" style="max-width:100%;height:auto"><figcaption>Kredit</figcaption></figure>')).not.toThrow();
});
