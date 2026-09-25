import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';
import { claimPreparation, releasePreparation } from '@/lib/liv/delivery-store';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { copenhagenClock } from '@/lib/liv/delivery-policy';
import { assertSuppliedApprovalEligible, suppliedApprovalInput, type SuppliedApproval } from '@/lib/liv/supplied-approval';
import { attachSuppliedCover } from '@/lib/liv/supplied-cover';
export const runtime = 'nodejs';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers:{'Cache-Control':'no-store'}});

export async function POST(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access?.owner) return json({error:'owner_required'}, access ? 403 : 401);
  let input;
  try { const raw = await req.text(); if (req.nextUrl.search || raw.length > 2900000) throw Error();
    input = suppliedApprovalInput.parse(JSON.parse(raw)); if (input.dayKey !== copenhagenClock().day) throw Error();
  } catch { return json({error:'liv_supplied_approval_invalid'},400); }
  let lease: string | null = null;
  try {
    lease = await claimPreparation(); if (!lease) return json({error:'already_preparing'},409);
    const db = getAdminDb(); if (!db) throw Error();
    const runId = `reserve-editorial-${input.dayKey}`, run = db.collection('livDailyArticles').doc(runId);
    const audit = run.collection('suppliedApprovals').doc(input.requestId), inputHash = cmsFieldHash(input);
    const prior = (await audit.get()).data();
    if (prior) { if (prior.inputHash !== inputHash || prior.approval.ownerUid !== access.uid) throw Error();
      return json({status:'already_approved',runId,checkpointHash:prior.approval.checkpointHash}); }
    const row = (await run.get()).data(), reservationRef = db.collection('livExplicitPreparations').doc(runId);
    const reservation = (await reservationRef.get()).data(), original = row?.articleCheckpoint;
    if (!row || !original || cmsFieldHash(original) !== input.expectedCheckpointHash ||
      row.articleCheckpointHash !== livImageArticleHash(original) ||
      !['failed','skipped_factcheck','skipped_moderation','skipped_tov'].includes(row.status) ||
      row.continuationReady || row.retryAuthorization || row.webflowItemId || row.cmsSaveStarted || row.preparationProof) throw Error();
    assertSuppliedApprovalEligible(original, reservation, row);
    const article = input.cover ? await attachSuppliedCover(original, input.cover) : original;
    assertSuppliedApprovalEligible(article, reservation, row);
    const approval: SuppliedApproval = {id:input.requestId,runId,checkpointHash:cmsFieldHash(article),reservationHash:reservation!.inputHash,
      ownerUid:access.uid,createdAt:new Date().toISOString(),authority:input.authority,reason:input.reason};
    const approvalHash = cmsFieldHash(approval);
    await db.runTransaction(async tx => {
      const current = (await tx.get(run)).data(), currentReservation = (await tx.get(reservationRef)).data();
      const state = (await tx.get(db.collection('livDelivery').doc('manifest'))).data(), exists = await tx.get(audit);
      if (exists.exists || !current || cmsFieldHash(current) !== cmsFieldHash(row) ||
        cmsFieldHash(currentReservation!) !== cmsFieldHash(reservation!) || state?.preparation?.token !== lease ||
        state.preparation.leaseUntil <= Date.now() || state.coverRevision ||
        Object.values(state.slots || {}).some((s:any) => s?.state === 'attempted')) throw Error();
      // Full prior run (including failures) is immutable audit, never relabelled.
      tx.create(audit,{inputHash,approval,approvalHash,previousRun:row,
        suppliedCover:input.cover ? {sourceHash:article.selectedImage.sourceHash,printedBookTitlePreserved:true,rightsStatus:'unverified'} : null});
      tx.update(run,{articleCheckpoint:article,articleCheckpointHash:livImageArticleHash(article),
        suppliedEditorialApproval:{id:input.requestId,hash:approvalHash}});
    });
    return json({status:'editorially_approved',runId,checkpointHash:approval.checkpointHash,aiFactcheck:false,queued:false});
  } catch { return json({error:'liv_supplied_approval_conflict'},409); }
  finally {if (lease) await releasePreparation(lease).catch(()=>{});}
}
