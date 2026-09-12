import { beforeEach, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ rows: new Map<string, Record<string, any>>(), available: true }));
vi.mock('@/lib/firebase-admin', () => {
  const doc = (collection: string, id: string) => ({ id, key: `${collection}/${id}`,
    get: async () => ({ data: () => structuredClone(database.rows.get(`${collection}/${id}`)) }) });
  return { getAdminStorageBucket: vi.fn(), getAdminDb: () => database.available ? {
    collection: (name: string) => ({ doc: (id: string) => doc(name, id),
      where: (field: string, _op: string, value: unknown) => ({ limit: (limit: number) => ({ query: name, field, value, limit }) }) }),
    runTransaction: async (fn: any) => {
      const writes: Array<() => void> = [];
      const result = await fn({
        get: async (ref: any) => {
          if (writes.length) throw new Error('read_after_write');
          if (ref.query) return { docs: [...database.rows].filter(([key, row]) => key.startsWith(`${ref.query}/`) && row[ref.field] === ref.value)
            .slice(0, ref.limit).map(([key, row]) => ({ id: key.split('/')[1], data: () => structuredClone(row) })) };
          return { exists: database.rows.has(ref.key), data: () => structuredClone(database.rows.get(ref.key)) };
        },
        set: (ref: any, value: any) => writes.push(() => database.rows.set(ref.key, structuredClone(value))),
        create: (ref: any, value: any) => {
          if (database.rows.has(ref.key)) throw new Error('exists');
          writes.push(() => database.rows.set(ref.key, structuredClone(value)));
        },
      });
      writes.forEach(write => write()); return result;
    },
  } : null };
});
const io=vi.hoisted(()=>({read:vi.fn(),apply:vi.fn(),reconcile:vi.fn(),duplicates:vi.fn(),release:vi.fn()}));
vi.mock('@/lib/seo-engine/post-publish/cms',()=>({readPublishedArticle:io.read,applyPublishedMetadata:io.apply,reconcilePublishedMetadata:io.reconcile}));
vi.mock('@/lib/seo-engine/post-publish/uniqueness',()=>({checkLiveMetadataDuplicates:io.duplicates}));
vi.mock('@/lib/seo-engine/cms-write-lease',()=>({acquireCmsWriteLease:async()=>({assertOwned:async()=>{},release:io.release})}));
import {reviseReviewedMetadata} from '@/lib/seo-engine/post-publish/editorial-revision';
import {reviewKey} from '@/lib/seo-engine/post-publish/policy';
import {createHash} from 'node:crypto';
const snapshot={itemId:'a'.repeat(24),locale:'da' as const,published:true,hasUnpublishedChanges:false,contentVersion:'body',metadata:{seoTitle:'Original good title',metaDescription:'Vague introductory description'}};
const input={itemId:snapshot.itemId,requestId:'operator-review-01',expectedReviewKey:reviewKey(snapshot),reason:'Explicit editorial review: description now identifies the documented subject.',patch:{metaDescription:'Specific article-grounded description of the actual subject.'}};
const key='seoPostPublishArticles/'+createHash('sha256').update(`${snapshot.itemId}:da`).digest('hex');
const receipt={after:{...snapshot,metadata:{...snapshot.metadata,...input.patch}},publicReceipt:{url:'https://www.aproposmagazine.com/articles/example',checkedAt:'now'}};
beforeEach(()=>{vi.resetAllMocks();database.rows.clear();io.read.mockResolvedValue({snapshot});io.duplicates.mockResolvedValue({seoTitle:[],metaDescription:[]});io.reconcile.mockResolvedValue(receipt);io.apply.mockImplementation(async args=>{await args.beforeWrite(snapshot);return receipt;});});
it('records explicit editorial provenance, real receipt and cooldown, preserving original title',async()=>{
 expect(await reviseReviewedMetadata(input)).toEqual(receipt);expect(io.apply).toHaveBeenCalledTimes(1);
 expect(database.rows.get(key)?.pendingJobId).toBeNull();expect(database.rows.get(key)?.lastAppliedAt).toBeTruthy();
 const audit=[...database.rows].find(([k])=>k.startsWith('seoEditorialRevisions/'))![1];
 expect(audit.before.metadata.seoTitle).toBe(snapshot.metadata.seoTitle);expect(audit.review.kind).toBe('explicit-editorial-correction');expect(audit.status).toBe('applied');
});
it('never repeats an ambiguous CMS write and clears the pending state only after readback',async()=>{
 io.apply.mockImplementationOnce(async args=>{await args.beforeWrite(snapshot);throw new Error('ambiguous');});
 await expect(reviseReviewedMetadata(input)).rejects.toThrow('ambiguous');expect(database.rows.get(key)?.pendingJobId).toBeTruthy();
 await reviseReviewedMetadata(input);expect(io.apply).toHaveBeenCalledTimes(1);expect(io.reconcile).toHaveBeenCalledTimes(1);
});
it('replays completed requests without calls or writes',async()=>{await reviseReviewedMetadata(input);await reviseReviewedMetadata(input);expect(io.apply).toHaveBeenCalledTimes(1);expect(io.read).toHaveBeenCalledTimes(1);});
it('respects field locks and rejects outdated snapshots',async()=>{
 database.rows.set(key,{lockedFields:['metaDescription']});await expect(reviseReviewedMetadata(input)).rejects.toThrow('conflict');
 io.read.mockResolvedValue({snapshot:{...snapshot,contentVersion:'changed'}});await expect(reviseReviewedMetadata(input)).rejects.toThrow('article_changed');
});
it('rejects duplicate replacement metadata',async()=>{io.duplicates.mockResolvedValue({seoTitle:[],metaDescription:['other']});await expect(reviseReviewedMetadata(input)).rejects.toThrow('duplicate');expect(io.apply).not.toHaveBeenCalled();});
