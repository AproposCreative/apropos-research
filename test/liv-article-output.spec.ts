import { expect, it } from 'vitest';
import { livArticleResponseFormat, parseLivArticleOutput } from '@/lib/liv/article-output';

const article = { status: 'ready', title: 'En film med kant', subtitle: 'En konkret dom om filmens præmis',
  intro: 'En selvstændig åbning.', content: 'Første afsnit.\n\nAndet afsnit.', rating: 4,
  ratingReason: 'Konflikten er præcis, men afslutningen svækker filmens samlede vurdering.' };
it('keeps text, paragraphs and a justified numeric rating separate', () => {
  expect(parseLivArticleOutput(JSON.stringify(article), 'research-review')).toEqual({ ...article, missingEvidence: [] });
  expect(livArticleResponseFormat.json_schema.schema.required.sort())
    .toEqual(Object.keys(livArticleResponseFormat.json_schema.schema.properties).sort());
});
it.each([0, 7, 4.5, '4', '4/6', null])('rejects an invalid review rating %s without coercion', rating => {
  expect(() => parseLivArticleOutput(JSON.stringify({ ...article, rating }), 'research-review')).toThrow();
});
it.each([null, '', 'God film', 'x'.repeat(601)])('rejects an absent or invalid rationale', ratingReason => {
  expect(() => parseLivArticleOutput(JSON.stringify({ ...article, ratingReason }), 'research-review')).toThrow();
});
it('allows unrated articles but never invents or accepts unrequested stars', () => {
  expect(parseLivArticleOutput(JSON.stringify({ ...article, rating: null, ratingReason: null }), 'article').rating).toBeNull();
  expect(() => parseLivArticleOutput(JSON.stringify(article), 'article')).toThrow('unexpected_article_rating');
});
it('supports explicit abstention without forcing a judgment', () => {
  expect(() => parseLivArticleOutput(JSON.stringify({ ...article, status: 'insufficient_evidence',
    title: '', subtitle: '', intro: '', content: '', rating: null, ratingReason: null }), 'research-review'))
    .toThrow('article_evidence_insufficient');
});
it('preserves concrete missing evidence and rejects a contradictory ready result', () => {
  const missingEvidence = ['Der mangler dokumentation for den beskrevne slutscene.'];
  try {
    parseLivArticleOutput(JSON.stringify({ ...article, status: 'insufficient_evidence', missingEvidence }), 'research-review');
    throw new Error('Expected evidence rejection');
  } catch (error) {
    expect(error).toMatchObject({ code: 'article_evidence_insufficient', missingEvidence });
  }
  expect(() => parseLivArticleOutput(JSON.stringify({ ...article, missingEvidence }), 'research-review'))
    .toThrow('article_output_conflicting_status');
});
it.each(['not JSON', 'null', '[]', JSON.stringify({ ...article, content: '' }),
  JSON.stringify({ ...article, title: undefined }), JSON.stringify({ ...article, extra: 'field' })])('fails closed on malformed output', raw => {
  expect(() => parseLivArticleOutput(raw, 'research-review')).toThrow();
});
