import {expect,it,vi} from 'vitest';
import {assessLivCorpusMatches} from '@/lib/liv/corpus-similarity';
const article='En selvstændig anmeldelse undersøger skuespillets præcision, konflikter og visuelle rytme. '.repeat(8);
const source='En anden skribent diskuterer landskaberne, musikken, historiske referencer og forestillingens kostumer. '.repeat(8);
const url='https://www.aproposmagazine.com/articles/previous-season';
const deps=(decision='independent')=>({read:vi.fn(async()=>Buffer.from(`<h1>Tidligere sæson</h1><div class="rich-text w-richtext"><p>${source}</p></div>`)),review:vi.fn(async()=>({decision,reviewId:'saved-review'} as any))});
it('requires qualitative full-body evidence before clearing a semantic-only same-topic alert',async()=>{
 const d=deps();const r=await assessLivCorpusMatches(article,[{url,similarity:.86}],d);
 expect(r.independent).toBe(true);expect(r.evidence[0]).toMatchObject({url,reviewId:'saved-review',decision:'independent'});
 expect(d.review).toHaveBeenCalledWith(article,expect.stringContaining(source.trim()));
});
it.each(['borrowed','uncertain'])('keeps %s blocking',async decision=>{
 expect((await assessLivCorpusMatches(article,[{url,similarity:.86}],deps(decision))).independent).toBe(false);
});
it('blocks copied passages before a paid semantic call',async()=>{
 const d=deps();expect((await assessLivCorpusMatches(source,[{url,similarity:.9}],d)).independent).toBe(false);
 expect(d.review).not.toHaveBeenCalled();
});
it('blocks absent, ambiguous or unavailable full source text',async()=>{
 for(const html of ['<p>no body</p>','<div class="rich-text w-richtext">tiny</div>',`<div class="rich-text w-richtext">${source}</div><div class="rich-text w-richtext">${source}</div>`]){
  const d=deps();d.read.mockResolvedValue(Buffer.from(html));expect((await assessLivCorpusMatches(article,[{url,similarity:.9}],d)).independent).toBe(false);expect(d.review).not.toHaveBeenCalled();
 }
 const d=deps();d.read.mockRejectedValue(Error('timeout'));expect((await assessLivCorpusMatches(article,[{url,similarity:.9}],d)).independent).toBe(false);
});
it('does not fetch arbitrary corpus URLs or create an unbounded review cascade',async()=>{
 const d=deps();
 for(const matches of [[{url:'https://evil.example/articles/a',similarity:.9}],[{url:url+'?token=x',similarity:.9}],Array.from({length:4},()=>({url,similarity:.9}))]){
  expect((await assessLivCorpusMatches(article,matches,d)).independent).toBe(false);
 }
 expect(d.read).not.toHaveBeenCalled();expect(d.review).not.toHaveBeenCalled();
});
it('does not pass after just one of several high matches is cleared',async()=>{
 const d=deps();d.review.mockResolvedValueOnce({decision:'independent',reviewId:'first'} as any).mockResolvedValueOnce({decision:'borrowed',reviewId:'second'} as any);
 expect((await assessLivCorpusMatches(article,[{url,similarity:.9},{url:url+'-two',similarity:.87}],d)).independent).toBe(false);
});
