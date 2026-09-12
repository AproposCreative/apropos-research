import { expect, it } from 'vitest';
import { selectLivArticleFormat } from '@/lib/liv/review-format';
import { defaultEditorialPlan } from '@/lib/liv/rolling-plan';

const film = { title: 'Alle Guds farver', category: 'Film', source: {
  title: 'Alle Guds farver: anmeldelse', excerpt: 'Den nye dokumentar er biografaktuel.' } };

it.each([
  film,
  { title: '»Alle Guds farver«: En stærk debut', category: 'Film', source: { title: 'Anmeldelse' } },
  { title: 'The Bear', category: 'TV-serier', source: { title: 'The Bear', excerpt: 'Anmeldelse af den nye sæson.' } },
  { title: 'Alle Guds farver', source: film.source },
  { title: 'Alle Guds farver', category: 'Kultur & Mening', source: film.source },
])('defaults a named screen assessment to review: $title', topic => {
  expect(selectLivArticleFormat({ topic })).toBe('research-review');
});

it.each(['feature', 'interview', 'nyhed', 'news', 'analyse', 'analysis', 'essay', 'portræt', 'uden stjerner', 'ikke en anmeldelse'])(
  'preserves explicit %s intent despite a film-review source', intent => {
    expect(selectLivArticleFormat({ topic: film, directiveHint: `Skriv ${intent} om filmen.` })).toBe('article');
    expect(selectLivArticleFormat({ topic: film, expandedDirective: `Skriv ${intent} om filmen.` })).toBe('article');
  });

it('preserves explicit format choices', () => {
  expect(selectLivArticleFormat({ topic: film, articleFormat: 'article' })).toBe('article');
  expect(selectLivArticleFormat({ topic: { title: 'Album', category: 'Musik' }, articleFormat: 'research-review' })).toBe('research-review');
});

it.each([
  { title: 'Når forsoning bliver en VIP-oplevelse', category: 'Musik', source: film.source },
  { title: 'Oasis', category: 'Musik', source: { title: 'Oasis', excerpt: 'En ny film om bandet har premiere.' } },
  { title: 'Interview med instruktøren om »Alle Guds farver«', category: 'Film', source: film.source },
  { title: 'Ny trailer til »Alle Guds farver«', category: 'Film', source: film.source },
  { title: '»Alle Guds farver« får premiere næste år', category: 'Film', source: film.source },
  { title: 'Hvorfor er film så dyre?', category: 'Film', source: film.source },
  { title: 'De bedste film i denne måned', category: 'Film', source: film.source },
  { title: 'Alle Guds farver', category: 'Film' }, // no assessment or release cue
  { title: 'Ukendt værk' },
])('keeps non-review or uncertain coverage as an article: $title', topic => {
  expect(selectLivArticleFormat({ topic })).toBe('article');
});

it('lets the picked topic select format on new daily plans, retaining legacy reserve format', () => {
  const plan = defaultEditorialPlan('2026-09-15');
  expect(plan).not.toHaveProperty('articleFormat');
  expect(selectLivArticleFormat({ ...plan, topic: film })).toBe('research-review');
  expect(plan.directiveHint).not.toContain('kulturfeature');
  expect(defaultEditorialPlan('2026-09-15', true).articleFormat).toBe('article');
});
