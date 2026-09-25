import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { suppliedArticleInput, suppliedArticleCheckpoint, assertSuppliedCopyPreserved } from '@/lib/liv/supplied-article';
import { resolveLivMediaMode } from '@/lib/liv/automatic-media';
const paragraphs = readFileSync('docs/editorial/partybus/article.md', 'utf8').trim().split(/\n\n/);
const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const input = { title: paragraphs[0].slice(2), subtitle: paragraphs[1], intro: paragraphs[2],
  content: paragraphs.slice(3).map(s => s.startsWith('## ') ? `<h2>${escape(s.slice(3))}</h2>` : `<p>${escape(s)}</p>`).join('\n'),
  slug: 'boganmeldelse-de-truer-med-en-partybus', excerpt: paragraphs[1], section: 'Kultur', tags: ['Bøger'],
  seoTitle: 'De truer med en partybus', seoDescription: paragraphs[1], primaryKeyword: 'De truer med en partybus',
  rating: 5, ratingReason: 'Stærk fortællerstemme, men midterpartiet er langt.',
  researchSources: [{title: 'Forlaget', source: 'Forlaget', url: 'https://bog.dk/bog'}, {title: 'Bibliotek', source: 'Bibliotek', url:'https://bibliotek.dk/bog'}], imageSuggestions: [] };
it('accepts and preserves the complete supplied review instead of shortening to daily length', () => {
  const parsed = suppliedArticleInput.parse(input), article = suppliedArticleCheckpoint(parsed);
  expect(assertSuppliedCopyPreserved(article, parsed)).toBeGreaterThan(650);
  expect(article.rating).toBe(5); expect(article.aiModel).toBe('human-editorial');
  expect(article.content).toBe(input.content);
  expect(resolveLivMediaMode(article)).toBe('illustration');
  expect(resolveLivMediaMode({...article,subjectType:'film'})).toBe('photography');
  expect(assertSuppliedCopyPreserved({...article, content:article.content+'<figure><img src="https://example.com/a"><figcaption>Caption</figcaption></figure>'}, parsed)).toBeGreaterThan(650);
  expect(() => assertSuppliedCopyPreserved({...article, content:article.content.replace('partybus','bus')}, parsed)).toThrow('liv_supplied_copy_changed');
});
it.each(['<script>alert(1)</script>', '<p onclick="x">bad</p>', '<img src="x">', '<iframe src="x"></iframe>'])(
  'rejects unsafe or preapproved media markup %s', tag => expect(suppliedArticleInput.safeParse({...input,content:input.content+tag}).success).toBe(false));
it('rejects injected approvals and invalid ratings', () => {
  expect(suppliedArticleInput.safeParse({...input,gateResults:[{pass:true}]}).success).toBe(false);
  expect(suppliedArticleInput.safeParse({...input,rating:7}).success).toBe(false);
});
