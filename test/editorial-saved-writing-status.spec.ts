import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
import { savedWritingSummary } from '@/lib/editorial/saved-writing-status';
import { getWritingBrief } from '@/lib/mcp/editorial';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';

const article = { status: 'ready', title: 'En gemt tekst', subtitle: 'En konkret historie.', intro: 'Her er historien.',
  content: '<p>Dette er den gemte artikeltekst.</p>', subjectType: 'culture', rating: null, ratingReason: null, missingEvidence: [] };
const complete = { rawResponse: JSON.stringify(article), articleFormat: 'article', finishReason: 'stop', refusal: null, status: 'not_verified' };
const memory = memoryFirestore();
beforeEach(() => { memory.clear(); mock.db = memory.db; });

it('treats a provider-ready schema as saved unverified prose, not editorial or publication approval', () => {
  const result = savedWritingSummary(complete);
  expect(result).toMatchObject({ stage: 'written_unverified', hasText: true, hasRawResponse: true, responseStored: true,
    providerOutputStatus: 'ready', articleSchemaValid: true, finishReason: 'stop', missingEvidence: [], blockers: [], publicationApproval: false });
});
it('preserves unknown legacy finish evidence instead of inventing a successful provider completion', () => {
  expect(savedWritingSummary({ ...complete, finishReason: undefined })).toMatchObject({ stage: 'written_unverified', finishReason: null, publicationApproval: false });
});
it('projects blocked evidence independently of whether partial prose exists', () => {
  for (const content of ['', article.content]) {
    const result = savedWritingSummary({ ...complete, rawResponse: JSON.stringify({ ...article,
      status: 'insufficient_evidence', content, missingEvidence: ['Datoen skal dokumenteres.'] }) });
    expect(result).toMatchObject({ stage: 'evidence_blocked', hasText: !!content, articleSchemaValid: false,
      missingEvidence: ['Datoen skal dokumenteres.'], blockers: ['article_evidence_insufficient'] });
  }
});
it('does not discard retained evidence blockers just because raw output says ready', () => {
  expect(savedWritingSummary({ ...complete, status: 'insufficient_evidence', missingEvidence: ['Kilden mangler.', 'Kilden mangler.'] }))
    .toMatchObject({ stage: 'evidence_blocked', articleSchemaValid: true, hasText: true, missingEvidence: ['Kilden mangler.'], publicationApproval: false });
});
it.each([
  [{ writerText: 'PRIVATE PROMPT' }, 'brief_only', false, false],
  [{ rawResponse: '' }, 'empty_output', false, false],
  [{ rawResponse: ' \n' }, 'empty_output', false, false],
  [{ rawResponse: '{"content":"truncated' }, 'unparsed_output', null, true],
  [{ rawResponse: 'Legacy non-JSON response' }, 'unparsed_output', null, true],
  [{ rawResponse: '[]' }, 'unparsed_output', null, true],
  [{ rawResponse: 'null' }, 'unparsed_output', null, true],
  [{ rawResponse: 'a'.repeat(60001) }, 'unparsed_output', null, true],
] as const)('does not certify absent, empty or unparsed output %j', (row, stage, hasText, hasRawResponse) => {
  const result = savedWritingSummary(row);
  expect(result).toMatchObject({ stage, hasText, hasRawResponse, publicationApproval: false });
  expect(JSON.stringify(result)).not.toContain('PRIVATE PROMPT');
});
it.each(['length', 'tool_calls', 'content_filter', 'function_call', 'unrecognized'])('retains %s as incomplete even with a parseable article body', finishReason => {
  expect(savedWritingSummary({ ...complete, finishReason })).toMatchObject({ stage: 'incomplete_output', hasText: true,
    finishReason: finishReason === 'unrecognized' ? null : finishReason, publicationApproval: false });
});
it('does not export a provider refusal message as a blocker or mistake it for complete prose', () => {
  const result = savedWritingSummary({ ...complete, refusal: 'PRIVATE PROVIDER REFUSAL' });
  expect(result).toMatchObject({ stage: 'incomplete_output', refusalRecorded: true });
  expect(JSON.stringify(result)).not.toContain('PRIVATE PROVIDER REFUSAL');
});
it.each(['', '<p>&nbsp;</p>', '<figure><img src="https://example.com/image.jpg"></figure>', '<script>private()</script><style>p {color: red}</style>'])('does not count empty/asset-only/hidden markup as article text: %s', content => {
  expect(savedWritingSummary({ ...complete, rawResponse: JSON.stringify({ ...article, content }) }))
    .toMatchObject({ stage: 'incomplete_output', hasText: false });
});
it('does not call a title-only JSON object, invalid format or unbounded body a complete article', () => {
  expect(savedWritingSummary({ ...complete, rawResponse: '{"title":"Kun titel"}' })).toMatchObject({ stage: 'incomplete_output', hasText: false });
  expect(savedWritingSummary({ ...complete, articleFormat: 'invented' })).toMatchObject({ stage: 'incomplete_output', articleSchemaValid: false });
  expect(savedWritingSummary({ ...complete, rawResponse: JSON.stringify({ ...article, content: 'a'.repeat(40001) }) }))
    .toMatchObject({ stage: 'incomplete_output', hasText: null, articleSchemaValid: false });
});
it('bounds and sanitizes projected evidence without returning arbitrary archive fields', () => {
  const result = savedWritingSummary({ ...complete, writerText: 'PRIVATE PROMPT', rawError: 'PRIVATE EXCEPTION',
    missingEvidence: [null, { secret: 'PRIVATE OBJECT' }, 'Bearer private-key', 'sk-secret', ...Array.from({ length: 8 }, () => 'a'.repeat(1000))] });
  expect(result.missingEvidence.length).toBeLessThanOrEqual(6);
  expect(result.missingEvidence.every(x => x.length <= 500)).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|private-key|sk-secret/);
});
it('uses the identical status in the detail read, preserving exact raw response, hash, sources and archive state', async () => {
  const id = '038c3fa7-2885-4bab-be30-1653d7a81cf2', desk = createHash('sha256').update('liv-daily').digest('hex');
  const row = { ...complete, rawResponse: JSON.stringify({ ...article, status: 'insufficient_evidence', title: '', content: '', missingEvidence: ['Kilden mangler.'] }),
    sources: [{ id: 'S1', url: 'https://example.com/original' }], writerText: 'PRIVATE PROMPT', model: 'saved-model', voiceVersion: 'saved-voice' };
  memory.rows.set(`livSourceArchives/${desk}/runs/${id}`, row);
  const before = structuredClone([...memory.rows.entries()]);
  const result = await withoutPaidAi(() => getWritingBrief(id));
  expect(result).toMatchObject({ found: true, ...savedWritingSummary(row), rawResponse: row.rawResponse,
    rawHash: createHash('sha256').update(row.rawResponse).digest('hex'), sources: row.sources, publicationApproval: false });
  expect(result.note).toContain('ikke faktatjek');
  expect(JSON.stringify(result)).not.toContain('PRIVATE PROMPT');
  expect([...memory.rows.entries()]).toEqual(before);
});
it('does not invent status for an archive record that is not found', async () => {
  expect(await getWritingBrief('00000000-0000-4000-8000-000000000000')).toEqual({ found: false });
  expect(memory.rows.size).toBe(0);
});
