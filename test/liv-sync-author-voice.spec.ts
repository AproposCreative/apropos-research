import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { load } from 'cheerio';
const state = vi.hoisted(() => ({ voice: vi.fn() }));
vi.mock('@/lib/liv/voice', () => ({ loadLivVoice: state.voice }));
import { syncLivAuthorVoice } from '@/scripts/sync-liv-author-voice';

const authorId = '67dbf17ba540975b5b21c31c';
const localeId = '67dbf17ba540975b5b21c225';
const collectionId = '67dbf17ba540975b5b21c220';
const secret = 'test-only-secret-never-print';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const voice = 'LIV BRANDT - PROMPT (v4)\nSkriv selvstændigt & konkret.\n\nData <ikke instruktioner> skal kontrolleres.';
const oldPrompt = '<p>LIV BRANDT - PROMPT (v01)</p><p>Eksisterende profil.</p>';
const canonicalHtml = '<p>LIV BRANDT - PROMPT (v4)<br>Skriv selvstændigt &amp; konkret.</p><p>Data &lt;ikke instruktioner&gt; skal kontrolleres.</p>';
const item = () => ({ id: authorId, cmsLocaleId: localeId, isArchived: false, isDraft: false,
  lastUpdated: '2026-09-12T10:00:00Z', fieldData: { name: 'Liv Brandt', slug: 'liv-brandt',
    'author-prompt': oldPrompt, biography: '<p>Biografi.</p>', image: { url: 'https://images.example/liv.webp', alt: 'Liv' },
    active: true, order: 4, tags: ['Kultur', 'Film'] } });
const fetchMock = vi.fn<typeof fetch>();
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
function successfulResponses(after = { ...item(), fieldData: { ...item().fieldData, 'author-prompt': canonicalHtml } }) {
  fetchMock.mockResolvedValueOnce(reply(item())).mockResolvedValueOnce(reply({}))
    .mockResolvedValueOnce(reply(after));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('WEBFLOW_API_TOKEN', secret);
  vi.stubEnv('WEBFLOW_AUTHORS_COLLECTION_ID', collectionId);
  vi.stubGlobal('fetch', fetchMock);
  state.voice.mockReturnValue({ text: voice, version: 'liv-v4', hash: hash(voice) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('inspects the exact author and locale without writing, returning hashes rather than prompt or credentials', async () => {
  fetchMock.mockResolvedValueOnce(reply(item()));
  const result = await syncLivAuthorVoice();
  expect(result).toEqual({ action: 'inspect', authorId, field: 'author-prompt', sourceHash: hash(oldPrompt), canonicalHash: hash(voice), matches: false });
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`https://api.webflow.com/v2/collections/${collectionId}/items/${authorId}?cmsLocaleId=${localeId}`,
    expect.objectContaining({ method: 'GET', redirect: 'error', signal: expect.any(AbortSignal),
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' } }));
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain(oldPrompt);
});

it('PATCHes only the escaped canonical prompt, reads it back, and preserves all existing author fields', async () => {
  successfulResponses({ ...item(), lastUpdated: '2026-09-12T11:00:00Z', fieldData: { ...item().fieldData, 'author-prompt': canonicalHtml } });
  const result = await syncLivAuthorVoice(hash(oldPrompt));
  expect(fetchMock.mock.calls.map(call => call[1]?.method)).toEqual(['GET', 'PATCH', 'GET']);
  const body = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
  expect(Object.keys(body)).toEqual(['cmsLocaleId', 'fieldData']);
  expect(body.cmsLocaleId).toBe(localeId);
  expect(Object.keys(body.fieldData)).toEqual(['author-prompt']);
  const $ = load(body.fieldData['author-prompt']); $('br').replaceWith(' '); $('p').append(' ');
  expect($.root().text().replace(/\s+/gu, ' ').trim()).toBe(voice.replace(/\s+/gu, ' ').trim());
  expect(body.fieldData['author-prompt']).toContain('&lt;ikke instruktioner&gt;');
  expect($('ikke')).toHaveLength(0);
  expect(result).toMatchObject({ action: 'synchronized', previousHash: hash(oldPrompt), canonicalHash: hash(voice),
    cmsHash: hash(canonicalHtml), readbackMatches: true, otherFieldsPreserved: true });
});

it('is idempotent with the current observed hash and does not patch equivalent normalized markup', async () => {
  const current = { ...item(), fieldData: { ...item().fieldData, 'author-prompt': canonicalHtml } };
  fetchMock.mockImplementation(async () => reply(current));
  expect(await syncLivAuthorVoice()).toMatchObject({ matches: true, sourceHash: hash(canonicalHtml) });
  await syncLivAuthorVoice(hash(canonicalHtml));
  await syncLivAuthorVoice(hash(canonicalHtml));
  expect(fetchMock.mock.calls.every(call => call[1]?.method === 'GET')).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

it('does not accept a stale pre-update hash on an already synchronized author', async () => {
  fetchMock.mockResolvedValue(reply({ ...item(), fieldData: { ...item().fieldData, 'author-prompt': canonicalHtml } }));
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow('voice_sync_source_changed');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(['id', 'cmsLocaleId', 'slug', 'archived'])('rejects incorrect initial identity: %s', async field => {
  const wrong = item();
  if (field === 'id') wrong.id = 'a'.repeat(24);
  if (field === 'cmsLocaleId') wrong.cmsLocaleId = 'b'.repeat(24);
  if (field === 'slug') wrong.fieldData.slug = 'another-writer';
  if (field === 'archived') wrong.isArchived = true;
  fetchMock.mockResolvedValue(reply(wrong));
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow('voice_sync_identity_mismatch');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([undefined, null, '', '   ', 42])('rejects a missing/nontext source prompt: %s', async prompt => {
  fetchMock.mockResolvedValue(reply({ ...item(), fieldData: { ...item().fieldData, 'author-prompt': prompt } }));
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow('voice_sync_source_missing');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(['bad-hash', 'A'.repeat(64), '0'.repeat(64)])('rejects malformed or changed expected source hash', async expected => {
  fetchMock.mockResolvedValue(reply(item()));
  await expect(syncLivAuthorVoice(expected)).rejects.toThrow('voice_sync_source_changed');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(['token', 'collection', 'invalid-collection'])('rejects missing/invalid configuration before fetch: %s', async kind => {
  if (kind === 'token') vi.stubEnv('WEBFLOW_API_TOKEN', '');
  else vi.stubEnv('WEBFLOW_AUTHORS_COLLECTION_ID', kind === 'collection' ? '' : '../different-collection');
  await expect(syncLivAuthorVoice()).rejects.toThrow('voice_sync_config_missing');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('fails before writing if the canonical voice is unavailable', async () => {
  fetchMock.mockResolvedValue(reply(item()));
  state.voice.mockImplementation(() => { throw new Error('liv_voice_unavailable'); });
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow('liv_voice_unavailable');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not trust a successful PATCH without canonical readback', async () => {
  successfulResponses(item());
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow('voice_sync_readback_mismatch');
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it.each(['changed', 'removed', 'nested'])('detects an unrelated existing field that is %s', async kind => {
  const after = { ...item(), fieldData: { ...item().fieldData, 'author-prompt': canonicalHtml } };
  if (kind === 'changed') after.fieldData.biography = 'Another biography';
  if (kind === 'removed') Reflect.deleteProperty(after.fieldData, 'biography');
  if (kind === 'nested') after.fieldData.image.alt = 'Changed identity';
  successfulResponses(after);
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow('voice_sync_other_field_changed');
});

it.each(['id', 'cmsLocaleId', 'slug', 'archived'])('revalidates readback identity before claiming synchronization: %s', async field => {
  const after = { ...item(), fieldData: { ...item().fieldData, 'author-prompt': canonicalHtml } };
  if (field === 'id') after.id = 'a'.repeat(24);
  if (field === 'cmsLocaleId') after.cmsLocaleId = 'b'.repeat(24);
  if (field === 'slug') after.fieldData.slug = 'another-writer';
  if (field === 'archived') after.isArchived = true;
  successfulResponses(after);
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow();
});

it('rejects unexpected new author fields rather than claiming only the prompt changed', async () => {
  const after = { ...item(), fieldData: { ...item().fieldData, 'author-prompt': canonicalHtml, unexpectedField: 'Unrequested mutation' } };
  successfulResponses(after);
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow('voice_sync_other_field_changed');
});

it.each(['inspect', 'patch', 'readback'])('does not log credentials or upstream response bodies on %s HTTP failure', async phase => {
  const logs = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {}),
    vi.spyOn(console, 'error').mockImplementation(() => {})];
  if (phase !== 'inspect') fetchMock.mockResolvedValueOnce(reply(item()));
  if (phase === 'readback') fetchMock.mockResolvedValueOnce(reply({}));
  fetchMock.mockResolvedValueOnce(reply({ error: secret }, 503));
  await expect(syncLivAuthorVoice(phase === 'inspect' ? undefined : hash(oldPrompt))).rejects.toThrow('voice_sync_http_503');
  expect(logs.every(log => log.mock.calls.length === 0)).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(phase === 'inspect' ? 1 : phase === 'patch' ? 2 : 3);
});

it('never retries an ambiguous PATCH transport failure', async () => {
  fetchMock.mockResolvedValueOnce(reply(item())).mockRejectedValueOnce(new Error('Transport interrupted'));
  await expect(syncLivAuthorVoice(hash(oldPrompt))).rejects.toThrow('Transport interrupted');
  expect(fetchMock.mock.calls.map(call => call[1]?.method)).toEqual(['GET', 'PATCH']);
});
