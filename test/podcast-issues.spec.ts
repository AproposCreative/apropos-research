import { beforeEach, expect, it, vi } from 'vitest';
import { podcastIssueId } from '../lib/podcast/delivery-format';
const mocks = vi.hoisted(() => ({ records: new Map<string, any>(), writes: 0 }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: (name: string) => ({
  doc: (id: string) => ({ path: name+'/'+id, get: async () => ({ exists: mocks.records.has(name+'/'+id), data: () => mocks.records.get(name+'/'+id) }),
    set: async (data: any, options: any) => { mocks.records.set(name+'/'+id, options?.merge ? {...mocks.records.get(name+'/'+id),...data} : data); mocks.writes++; } }),
  where: () => ({ limit: () => ({ get: async () => ({docs:[...mocks.records].filter(([path,v])=>path.startsWith(name+'/')&&v.active).map(([,v])=>({data:()=>v}))}) }) }),
}), runTransaction: async (run: any) => run({get: async (ref: any) => ({data:()=>mocks.records.get(ref.path)}),
  set: (ref: any,data: any,options: any) => {mocks.records.set(ref.path,options?.merge?{...mocks.records.get(ref.path),...data}:data);mocks.writes++;} }) }) }));
vi.mock('@/lib/podcast/manifest', () => ({}));
vi.mock('@/lib/podcast/feed-metadata', () => ({}));
vi.mock('@/lib/podcast/delivery-facts', () => ({}));
import { reconcilePodcastIssues, acknowledgePodcastIssue, readPodcastIssues } from '../lib/podcast/operations';
const problem = {scope:'guid-a',stage:'duration',reason:'duration_unavailable'};
beforeEach(()=>{mocks.records.clear();mocks.writes=0;});
it('records baseline problems quietly and does not rewrite or notify unchanged failures', async()=>{
  await reconcilePodcastIssues([problem],[]);const old=(await readPodcastIssues())[0];expect(old.acknowledgedFingerprint).toBe(old.fingerprint);
  mocks.records.set('podcastFeedOperations/delivery-status',{report:{}});const writes=mocks.writes;
  await reconcilePodcastIssues([problem],[]);expect(mocks.writes).toBe(writes);expect((await readPodcastIssues())[0]).toEqual(old);
});
it('requires the exact incident fingerprint for acknowledgement and makes a real recurrence new', async()=>{
  mocks.records.set('podcastFeedOperations/delivery-status',{});await reconcilePodcastIssues([problem],[]);
  const first=(await readPodcastIssues())[0];expect(first.acknowledgedFingerprint).toBeNull();
  expect(await acknowledgePodcastIssue(first.id,'c'.repeat(64))).toBe(false);
  expect(await acknowledgePodcastIssue(first.id,first.fingerprint)).toBe(true);
  await reconcilePodcastIssues([],['duration']);expect(await readPodcastIssues()).toEqual([]);
  await reconcilePodcastIssues([problem],[]);expect((await readPodcastIssues())[0].acknowledgedFingerprint).toBeNull();
});
it('does not resolve unattempted stages while safely clearing a repaired incident', async()=>{
  await reconcilePodcastIssues([problem,{scope:'feed',stage:'mirror',reason:'feed_mirror_failed'}],[]);
  await reconcilePodcastIssues([],['duration']);const active=await readPodcastIssues();expect(active).toHaveLength(1);expect(active[0].id).toBe(podcastIssueId('feed','mirror'));
});
