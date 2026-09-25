import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const s=vi.hoisted(()=>({rows:new Map<string,any>(),writes:vi.fn()}));
vi.mock('@/lib/firebase-admin',()=>{const ref=(p:string):any=>({path:p,get:async()=>({data:()=>s.rows.get(p)}),collection:(n:string)=>({doc:(id:string)=>ref(`${p}/${n}/${id}`)})});return {getAdminDb:()=>({collection:(n:string)=>({doc:(id:string)=>ref(`${n}/${id}`)}),runTransaction:async(fn:any)=>fn({get:(r:any)=>r.get(),create:(r:any,d:any)=>{s.rows.set(r.path,d);s.writes()}})})};});
import { readPrintedBookApproval, inheritPrintedBookApproval } from '@/lib/images/printed-book-approval';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const bytes=Buffer.from('owner selected artwork'),encoded=Buffer.from('same artwork resized');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const runId='reserve-editorial-2026-09-25',id='owner-original-approval';
const approval={authority:'owner-approved-original-review',ownerUid:'frederik'};
const key=`printedBookImageApprovals/${hash(bytes)}`,audit=`livDailyArticles/${runId}/suppliedApprovals/${id}`;
beforeEach(()=>{s.rows.clear();s.writes.mockClear();s.rows.set(key,{kind:'owner-selected-printed-book',contentHash:hash(bytes),rootContentHash:hash(bytes),runId,approvalId:id,approvalHash:cmsFieldHash(approval)});
  s.rows.set(audit,{approval,approvalHash:cmsFieldHash(approval),suppliedCover:{contentHash:hash(bytes),printedBookTitlePreserved:true}});
});
it('accepts only exact bytes backed by immutable owner approval, never generic text-free evidence',async()=>{
  expect(await readPrintedBookApproval(bytes)).toMatchObject({kind:'owner-selected-printed-book'});
  expect(await readPrintedBookApproval(Buffer.from('other book'))).toBeNull();
  expect(await readPrintedBookApproval(encoded)).toBeNull();
});
it('preserves permission for deterministic resized bytes without changing root receipt',async()=>{
  await inheritPrintedBookApproval(bytes,encoded);await inheritPrintedBookApproval(bytes,encoded);
  expect(await readPrintedBookApproval(encoded)).toMatchObject({rootContentHash:hash(bytes),contentHash:hash(encoded)});
  expect(s.writes).toHaveBeenCalledOnce();expect(s.rows.get(audit).approval).toEqual(approval);
});
it.each(['hash','owner','root','permission','path'])('rejects tampered %s approval',async mode=>{
  if(mode==='hash')s.rows.get(key).approvalHash='x';
  if(mode==='owner')s.rows.get(audit).approval={...approval,ownerUid:''};
  if(mode==='root')s.rows.get(audit).suppliedCover.contentHash='x';
  if(mode==='permission')s.rows.get(audit).suppliedCover.printedBookTitlePreserved=false;
  if(mode==='path')s.rows.get(key).runId='../../other';
  await expect(readPrintedBookApproval(bytes)).rejects.toThrow('printed_book_approval_invalid');
});
