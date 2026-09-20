import {it,expect} from 'vitest';
import {captionFallbackCandidate} from '@/lib/liv/caption-fallback';
import {articleFingerprint} from '@/lib/factcheck/grounded';
import {livImageArticleHash} from '@/lib/liv/article-image-hash';
const fixture=()=>{
 const media:any={role:'body-2',kind:'photography',url:'https://images.example/photo.webp',alt:'Fire personer ser på en computerskærm.',caption:'Gruppen løser en sag.',credit:'Foto: Prime Video',width:1000,height:600};
 const article:any={title:'Reacher',intro:'Intro',slug:'reacher',content:`<p>Uændret artikel.</p><figure data-liv-media="body-2"><img src="${media.url}" alt="${media.alt}" width="1000" height="600"><figcaption>${media.caption} ${media.credit}</figcaption></figure>`,preparedMedia:[media],selectedImage:{visualReview:'automated'}};
 const report:any={complete:false,verificationMethod:'retrieved-sources',articleHash:articleFingerprint([article.title,article.intro,article.content].join('\n\n')),coverage:{checkedUnits:1,expectedUnits:1},sources:[{id:'visual-body-2-alt',url:media.url}],results:[{claim:media.caption,status:'unverifiable',citations:[]},{claim:media.alt,status:'verified',citations:[{sourceId:'visual-body-2-alt',quote:media.alt}]}]};
 return {article,report,media};
};
it('uses only the exact verified alt while preserving prose, pixels and credit',()=>{
 const {article,report,media}=fixture();const original=structuredClone(article);
 const next=captionFallbackCandidate(article,report)!;
 expect(next.preparedMedia![0]).toEqual({...media,caption:media.alt});
 expect(next.content).toContain(`<figcaption>${media.alt} ${media.credit}</figcaption>`);
 expect(next.content).toContain('<p>Uændret artikel.</p>');
 expect(next.selectedImage!.articleHash).toBe(livImageArticleHash(next));
 expect(article).toEqual(original);
});
it.each(['stale','incomplete','other-fact','unverified-alt','wrong-image','wrong-quote','repeated','operator','no-report'])('does not repair %s',kind=>{
 const {article,report}=fixture();
 if(kind==='stale')report.articleHash='changed';
 if(kind==='incomplete')report.coverage.checkedUnits=0;
 if(kind==='other-fact')report.results.push({claim:'Sæsonen udkommer i morgen.',status:'unverifiable',citations:[]});
 if(kind==='unverified-alt')report.results[1].status='unverifiable';
 if(kind==='wrong-image')report.sources[0].url='https://images.example/other.webp';
 if(kind==='wrong-quote')report.results[1].citations[0].quote='Other';
 if(kind==='repeated')article.selectedImage.captionRepairId='prior';
 if(kind==='operator')article.selectedImage.editorialEdit={};
 expect(captionFallbackCandidate(article,kind==='no-report'?undefined:report)).toBeNull();
});
