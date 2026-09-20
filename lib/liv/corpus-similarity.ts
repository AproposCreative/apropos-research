import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import {readPublicMedia} from './public-media-reader';
import {lexicalSourceScores} from './source-similarity';
import {reviewSemanticSource} from './semantic-source-review';

/** Embeddings identify related topics, not plagiarism. Qualitatively examine
 * each high-scoring own-corpus match; keep missing, copied or uncertain evidence
 * blocking. This supplements (never replaces) external-source similarity. */
export async function assessLivCorpusMatches(article:string, matches:Array<{url?:string;similarity:number}>, deps={
  read:readPublicMedia, review:reviewSemanticSource,
}) {
  const high=matches.filter(m=>m.similarity>=0.85);
  const evidence:Array<{url:string;sourceHash:string;reviewId:string;decision:string}>=[];
  if(!high.length || high.length>3 || article.length<80 || article.length>60000) return {independent:false,evidence};
  for(const match of high){
    try {
      const u=new URL(match.url || '');
      if(u.origin!=='https://www.aproposmagazine.com' || u.username || u.password || u.search || u.hash ||
        !/^\/articles\/[a-z0-9-]+$/.test(u.pathname)) return {independent:false,evidence};
      const $=load((await deps.read(u.href,'html')).toString('utf8'));
      const root=$('.rich-text.w-richtext');
      if(root.length!==1) return {independent:false,evidence};
      root.find('script,style,nav,footer,[hidden],figcaption').remove();
      root.find('p,h1,h2,h3,h4,li,br').each((_,n)=>{$(n).append(' ');});
      const source=[$('h1').first().text(),root.text()].join('\n\n').replace(/[\t ]+/g,' ').trim();
      if(source.length<200 || source.length>60000) return {independent:false,evidence};
      const lexical=lexicalSourceScores(article,source);
      if(lexical.copiedPassage || lexical.ngramJaccard>0.18) return {independent:false,evidence};
      const review=await deps.review(article,source);
      evidence.push({url:u.href,sourceHash:createHash('sha256').update(source).digest('hex'),reviewId:review.reviewId,decision:review.decision});
      if(review.decision!=='independent') return {independent:false,evidence};
    } catch { return {independent:false,evidence}; }
  }
  return {independent:true,evidence};
}
