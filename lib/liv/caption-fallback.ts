import {getAdminDb} from '@/lib/firebase-admin';
import {articleFingerprint,type GroundedReport} from '@/lib/factcheck/grounded';
import {cmsFieldHash} from './cms-field-hash';
import {livImageArticleHash} from './article-image-hash';
import {applyLivMediaDescriptionCorrections} from './media-description-repair';
import type {GeneratedArticle} from './generate-article';

/** No model call or approval: replace an unsupported caption only with the
 * exact alt text the same pixel-grounded report already verified. All other
 * defects, edits, credits, pixels and prior paid receipts remain untouched. */
export function captionFallbackCandidate(article:GeneratedArticle,report?:GroundedReport):GeneratedArticle|null{
 if(!report || report.complete || report.diagnostic || report.verificationMethod!=='retrieved-sources' ||
   article.selectedImage?.captionRepairId || article.selectedImage?.editorialEdit ||
   article.selectedImage?.visualReview!=='automated' || !article.preparedMedia?.every(m=>m.kind==='photography') ||
   report.coverage.checkedUnits!==report.coverage.expectedUnits ||
   report.articleHash!==articleFingerprint([article.title,article.subtitle,article.excerpt,article.seoTitle,article.seoDescription,article.ratingReason,article.intro,article.content].filter(Boolean).join('\n\n')))return null;
 const failed=report.results.filter(r=>r.status!=='verified');
 if(!failed.length || failed.length>2)return null;
 const corrections=[];
 for(const claim of failed){
  const image=article.preparedMedia?.find(m=>m.role!=='hero' && m.caption===claim.claim && m.alt!==m.caption);
  if(!image || corrections.some(c=>c.role===image.role))return null;
  const source=report.sources.find(s=>s.id===`visual-${image.role}-alt` && s.url===image.url);
  const verified=report.results.find(r=>r.status==='verified' && r.claim===image.alt &&
    r.citations.some(c=>c.sourceId===source?.id && c.quote===image.alt));
  if(!source || !verified)return null;
  corrections.push({role:image.role,alt:image.alt,caption:image.alt});
 }
 const revised=applyLivMediaDescriptionCorrections(article,{corrections});
 revised.selectedImage={...article.selectedImage!,articleHash:livImageArticleHash(revised)};
 return revised;
}

export async function repairLivCaptionFromVerifiedAlt(article:GeneratedArticle,report:(GroundedReport & {visualContextHash?:string})|undefined,runId:string){
 const revised=captionFallbackCandidate(article,report);
 if(!revised)return null;
 if(!/^(?:prepare|reserve-editorial)-\d{4}-\d{2}-\d{2}$/.test(runId) ||
  report?.visualContextHash!==cmsFieldHash({runId,checkpointHash:cmsFieldHash(article as unknown as Record<string,unknown>)}))return null;
 const db=getAdminDb();if(!db)throw Error('liv_caption_store_unavailable');
 const id=cmsFieldHash({article,report,runId});
 revised.selectedImage={...revised.selectedImage!,captionRepairId:id};
 const ref=db.collection('livCaptionRepairs').doc(id);
 await db.runTransaction(async tx=>{
  const prior=(await tx.get(ref)).data();
  if(prior){if(cmsFieldHash(prior.article)!==cmsFieldHash(revised as unknown as Record<string,unknown>))throw Error('liv_caption_conflict');return;}
  const current=(await tx.get(db.collection('livDailyArticles').doc(runId))).data();
  if(!current?.articleCheckpoint || cmsFieldHash(current.articleCheckpoint)!==cmsFieldHash(article as unknown as Record<string,unknown>))throw Error('liv_caption_conflict');
  tx.create(ref,{previous:article,article:revised,report,runId,createdAt:new Date().toISOString(),policy:'verified-alt-caption-v1'});
 });
 return revised;
}

export async function readLivCaptionAncestor(article:GeneratedArticle,runId:string):Promise<GeneratedArticle>{
 const id=article.selectedImage?.captionRepairId;
 if(!id)return article;
 if(!/^[a-f0-9]{64}$/.test(id))throw Error('liv_caption_evidence_invalid');
 const row=(await getAdminDb()!.collection('livCaptionRepairs').doc(id).get()).data();
 if(!row || row.runId!==runId || row.policy!=='verified-alt-caption-v1' ||
  cmsFieldHash({article:row.previous,report:row.report,runId})!==id)throw Error('liv_caption_evidence_invalid');
 const candidate=captionFallbackCandidate(row.previous,row.report);
 if(!candidate)throw Error('liv_caption_evidence_invalid');
 candidate.selectedImage={...candidate.selectedImage!,captionRepairId:id};
 if(cmsFieldHash(candidate as unknown as Record<string,unknown>)!==cmsFieldHash(article as unknown as Record<string,unknown>) ||
  cmsFieldHash(row.article)!==cmsFieldHash(article as unknown as Record<string,unknown>))throw Error('liv_caption_evidence_invalid');
 return row.previous;
}
