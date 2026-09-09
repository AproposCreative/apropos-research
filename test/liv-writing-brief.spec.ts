import { beforeEach, expect, it, vi } from 'vitest';
import { buildLivWritingBrief, validateWritingBrief } from '@/lib/liv/writing-brief';
import { livResearchQueries } from '@/lib/liv/research-query';
const m = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.create } } }) }));
const sources = [
  { id: 'S1', url: 'https://primary.example/film', title: 'Film', text: 'Instruktøren hedder Ada Holm. Filmen foregår i et sommerhus. De fire roller spilles af fire skuespillere.', contentHash: 'hash1', retrievedAt: '2026-09-09T12:00:00Z', publishedAt: null },
  { id: 'S2', url: 'https://critic.example/review', title: 'Kritik', text: 'Anmeldelsen kritiserer filmens langsomme afslutning.', contentHash: 'hash2', retrievedAt: '2026-09-09T12:00:00Z', publishedAt: null },
];
const notes = [
  { sourceId: 'S1', kind: 'fact', summary: 'Ada Holm står for instruktionen.', evidence: 'Instruktøren hedder Ada Holm.' },
  { sourceId: 'S1', kind: 'fact', summary: 'Sommerhuset er handlingens sted.', evidence: 'Filmen foregår i et sommerhus.' },
  { sourceId: 'S1', kind: 'fact', summary: 'Der er fire roller i filmen.', evidence: 'De fire roller spilles af fire skuespillere.' },
  { sourceId: 'S2', kind: 'opinion', summary: 'Hos critic.example er slutningens tempo en indvending.', evidence: 'Anmeldelsen kritiserer filmens langsomme afslutning.' },
];
beforeEach(() => { vi.resetAllMocks(); });
it('keeps evidence for audit while giving the writer neutral, attributed notes only', () => {
  const brief = validateWritingBrief({ notes }, sources);
  expect(brief.notes).toHaveLength(4);
  expect(brief.writerText).toContain('ANDRES VURDERING, kræver tilskrivning');
  expect(brief.writerText).not.toContain(sources[0].text);
  expect(brief.writerText).not.toContain('Instruktøren hedder Ada Holm.');
});
it.each([
  { ...notes[0], sourceId: 'S99' },
  { ...notes[0], evidence: 'Filmen vandt en pris på festivalen.' },
  { ...notes[0], kind: 'verified' },
  { ...notes[0], summary: '' },
])('rejects missing or invented provenance', note => {
  expect(() => validateWritingBrief({ notes: [note, ...notes.slice(1)] }, sources)).toThrow();
});
it('rejects repeated notes, a single host and too many critic verdicts', () => {
  expect(() => validateWritingBrief({ notes: [notes[0], notes[0], notes[2], notes[3]] }, sources)).toThrow();
  expect(() => validateWritingBrief({ notes }, sources.map(s => ({ ...s, url: 'https://one.example/' + s.id })))).toThrow();
  expect(() => validateWritingBrief({ notes: [...notes, ...[1,2,3].map(i => ({ ...notes[3], summary: `En anden gengivelse af kritik nummer ${i}` }))] }, sources)).toThrow();
});
it('uses a bounded structured extraction and rejects incomplete output', async () => {
  m.create.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ notes }) } }] });
  expect((await buildLivWritingBrief(sources, 'Film')).notes).toHaveLength(4);
  expect(m.create.mock.calls[0][1]).toEqual({ timeout: 45000, maxRetries: 0 });
  m.create.mockResolvedValueOnce({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify({ notes }) } }] });
  await expect(buildLivWritingBrief(sources, 'Film')).rejects.toThrow('research_brief_incomplete');
});
it('uses the work name, not the editorial thesis, for source discovery', () => {
  expect(livResearchQueries('The Invite (2026), Olivia Wilde: Når en middag bliver en stresstest af parforholdet'))
    .toEqual(['The Invite (2026), Olivia Wilde', 'The Invite (2026), Olivia Wilde anmeldelse review']);
  expect(() => livResearchQueries(' ')).toThrow();
  expect(livResearchQueries('Star Wars: A New Hope')[0]).toBe('Star Wars: A New Hope');
});
