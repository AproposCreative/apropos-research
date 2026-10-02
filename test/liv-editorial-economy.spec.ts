import { expect, it } from 'vitest';
import { articleUnits, assessmentSchema } from '@/lib/factcheck/grounded';
import { expandCompactEditorial, mergeEditorialUnits, reusableCaptionUnits, type EditorialBaseline } from '@/lib/liv/editorial-economy';
const fields = { title: 'Kultur', content: `<p>${'Et kulturværk kan noget. '.repeat(72)}</p>\n<figure><img src="https://example.test/1.jpg" alt="Motiv"><figcaption>En beskrivelse</figcaption></figure>` };
const text = (f: typeof fields) => `${f.title}\n\n${f.content}`;
const units = articleUnits(text(fields));
const baseline: EditorialBaseline = { assessmentId: 'a'.repeat(64), contextHash: 'context', fields, units,
  raw: { units: units.map(u => ({ id: u.id, opinionOnly: true, claims: [] })) }, sourceHashes: {} };
const changed = { ...fields, content: fields.content.replace('En beskrivelse', 'Et nyt motiv') };
it('reuses exact unchanged units only for caption/alt changes', () => {
  const reused = reusableCaptionUnits(baseline, changed, 'context', text(changed), {});
  expect(reused).toHaveLength(1); expect(reused[0].id).toBe('u1');
});
it.each([
  { ...changed, title: 'Anden titel' },
  { ...changed, content: changed.content.replace('Et kulturværk', 'Et andet værk') },
  { ...changed, content: changed.content.replace('1.jpg', '2.jpg') },
  { ...changed, content: changed.content.replace('Et nyt motiv', '<b>Et nyt motiv</b>') },
])('does not reuse after meaningful field/prose/image/markup changes', next => {
  expect(reusableCaptionUnits(baseline, next, 'context', text(next), {})).toEqual([]);
});
it('invalidates with changed policy/source/model/voice/date context or corrupt saved report', () => {
  expect(reusableCaptionUnits(baseline, changed, 'changed-context', text(changed), {})).toEqual([]);
  expect(reusableCaptionUnits({ ...baseline, raw: null }, changed, 'context', text(changed), {})).toEqual([]);
});
it('does not reuse verified claims after cited source contents change', () => {
  const prior = { ...baseline, sourceHashes: { s1: 'old' }, raw: { units: [
    { id: 'u1', opinionOnly: false, claims: [{ claim: 'Et kulturværk kan noget.', status: 'verified', explanation: 'Belæg', citations: [{ sourceId: 's1', quote: 'Et kulturværk kan noget.' }] }] },
  ] } };
  expect(reusableCaptionUnits(prior, changed, 'context', text(changed), { s1: 'new' })).toEqual([]);
});
it('rejects missing, duplicate and unexpected provider units', () => {
  const reused = [{ id: 'u1', opinionOnly: true, claims: [] }];
  for (const id of ['u1', 'u99']) expect(() => mergeEditorialUnits({ units: [{ ...reused[0], id }] }, reused, text(changed))).toThrow('delta_invalid');
  expect(mergeEditorialUnits({ units: [{ ...reused[0], id: 'u2' }] }, reused, text(changed))).toMatchObject({ units: [{ id: 'u1' }, { id: 'u2' }] });
});
it('never fills an empty explanation for a failure or manufactures citations', () => {
  const raw = { units: [{ id: 'u1', opinionOnly: false, claims: [{ claim: 'En faktuel påstand.', status: 'unverifiable', explanation: '', citations: [] }] }] };
  expect(assessmentSchema.safeParse(expandCompactEditorial(raw)).success).toBe(false);
});
