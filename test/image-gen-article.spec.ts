import { expect, it } from 'vitest';
import { imageGenArticle, insertImageGenFigures, validateImageGenMotifs } from '@/lib/image-gen/article';
const content = '<h2>Gobs på Wonderfestiwall</h2><p>En stor abe stod på scenen under koncerten.</p><p>Publikum sang med på omkvædet.</p>';
const article = () => imageGenArticle('a'.repeat(24), 'Gobs', content, null);
const motif = (n: number) => ({ title: `Motiv ${n}`, description: `En enkel illustration af koncerten, variant ${n}.`,
  sectionId: article().sections[1].id, excerpt: 'En stor abe stod på scenen' });
it('anchors three motifs in actual text and preserves the source', () => {
  const a = article(); expect(validateImageGenMotifs([motif(1), motif(2), motif(3)], a)).toHaveLength(3);
  expect(a.content).toBe(content);
});
it('rejects invented excerpts, duplicate motives and unknown anchors', () => {
  for (const invalid of [{ ...motif(3), excerpt: 'Gobs fløj over publikum' }, motif(1), { ...motif(3), sectionId: 'missing' }]) {
    expect(() => validateImageGenMotifs([motif(1), motif(2), invalid], article())).toThrow();
  }
});
it('changes the snapshot version when title, body or cover changes', () => {
  const a = article();
  for (const b of [imageGenArticle(a.id, 'Ny titel', content, null), imageGenArticle(a.id, a.title, content + '<p>Ny</p>', null),
    imageGenArticle(a.id, a.title, content, { url: 'new' })]) expect(b.version).not.toBe(a.version);
});
const placement = () => ({ sectionId: article().sections[1].id, url: 'https://cdn.prod.website-files.com/a/image.webp',
  alt: 'En illustreret abe på scenen', caption: '<script>not executable</script>', credit: 'Illustration: Apropos / AI' });
it('inserts an escaped figure after the chosen paragraph without changing prose', () => {
  const a = article(); const html = insertImageGenFigures(a, a.version, [placement()]);
  expect(html).toContain('En stor abe stod på scenen under koncerten.</p><figure');
  expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
  expect(html).toContain('Publikum sang med på omkvædet.');
});
it('rejects stale previews, unsafe assets and duplicate placement', () => {
  const a = article();
  expect(() => insertImageGenFigures(a, 'stale', [placement()])).toThrow('article_changed');
  expect(() => insertImageGenFigures(a, a.version, [{ ...placement(), url: 'https://127.0.0.1/x' }])).toThrow('asset_not_stored');
  expect(() => insertImageGenFigures(a, a.version, [placement(), placement()])).toThrow('placements_invalid');
});
