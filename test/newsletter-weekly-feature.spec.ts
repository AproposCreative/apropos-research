import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ read: vi.fn(), feature: vi.fn(), lead: vi.fn(), fetchArticles: vi.fn(), live: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: (id: string) => ({ get: () => f.read(id) }) }) }) }));
vi.mock('@/lib/newsletter/send-selection-history', () => ({ getLatestNewsletterLeadArticleId: f.lead }));
vi.mock('@/lib/newsletter/webflow-sources', async (original) => ({
  ...await original<typeof import('@/lib/newsletter/webflow-sources')>(),
  fetchArticlesForWeek: f.fetchArticles,
  resolveLiveNewsletterFeature: f.live,
}));
import { getWeeklyNewsletterFeatureId, promoteWeeklyNewsletterFeature } from '@/lib/newsletter/weekly-feature';
import { prepareWeeklyArticlesForDraft, composeWeeklyNewsletterDraft } from '@/lib/newsletter/build-draft';
import type { NewsletterArticle } from '@/lib/newsletter/webflow-sources';

const bookId='6ae1f9da0e01d3d2ff34859f';
function article(id: string, title = id): NewsletterArticle {
  return { id, title, slug:id, excerpt:'En konkret artikel om kultur og læsning i København.',
    url:`https://www.aproposmagazine.com/articles/${id}`, thumbUrl:`https://images.example/${id}.webp`,
    selectionDate:'2026-10-28T12:00:00Z',lastPublished:'2026-10-28T12:00:00Z' };
}
const now=new Date('2026-10-30T10:00:00Z');
const book=article(bookId,'Boganmeldelse: Nogen der kender nogen');

beforeEach(()=>{vi.clearAllMocks();f.read.mockResolvedValue({exists:false});f.lead.mockResolvedValue(null);});
describe('weekly owner feature',()=>{
  it('looks up the send week in Copenhagen, not the previous content week',async()=>{
    f.read.mockImplementation((id)=>Promise.resolve({exists:id==='2026-W44',data:()=>({articleId:bookId})}));
    expect(await getWeeklyNewsletterFeatureId(now)).toBe(bookId);
    expect(await getWeeklyNewsletterFeatureId(new Date('2026-11-06T10:00:00Z'))).toBeNull();
    expect(f.read).toHaveBeenCalledWith('2026-W45');
  });
  it('deduplicates the feature and keeps the eight-article cap and remaining order',()=>{
    const others=Array.from({length:8},(_,i)=>article(String(i)));
    expect(promoteWeeklyNewsletterFeature([others[0]!,book,...others.slice(1)],book).map(a=>a.id))
      .toEqual([bookId,'0','1','2','3','4','5','6']);
  });
  it('includes an explicitly selected feature despite exclusions/previous-lead demotion and uses it for the hero',async()=>{
    f.read.mockResolvedValue({exists:true,data:()=>({articleId:bookId})});
    f.fetchArticles.mockResolvedValue({articles:[article('a'),article('b')],stats:{inWindowCount:2,inWindowAfterExclude:2,maxPicked:8}});
    f.live.mockResolvedValue(book);f.lead.mockResolvedValue(bookId);
    const prepared=await prepareWeeklyArticlesForDraft({referenceDate:now,excludeArticleIds:new Set([bookId])});
    expect(prepared.articles.map(a=>a.id)).toEqual([bookId,'a','b']);
    const draft=await composeWeeklyNewsletterDraft({...prepared,skipAiIntro:true});
    expect(draft.intro).toContain('Vi lægger ud med »Boganmeldelse: Nogen der kender nogen«');
    const hero=draft.html.indexOf('class="nl-hero-img"');
    expect(draft.html.slice(hero,hero+500)).toContain(book.thumbUrl);
    expect(draft.articles[0]?.id).toBe(bookId);
  });
  it('keeps normal selection when this send week has no feature',async()=>{
    f.fetchArticles.mockResolvedValue({articles:[article('a'),article('b')]});
    const prepared=await prepareWeeklyArticlesForDraft({referenceDate:now});
    expect(prepared.articles.map(a=>a.id)).toEqual(['a','b']);expect(f.live).not.toHaveBeenCalled();
  });
  it('does not change a historical preview with this weeks feature',async()=>{
    f.read.mockResolvedValue({exists:true,data:()=>({articleId:bookId})});
    f.fetchArticles.mockResolvedValue({articles:[article('historical')]});
    const prepared=await prepareWeeklyArticlesForDraft({referenceDate:now,week:{
      start:new Date('2026-10-12T00:00:00Z'),end:new Date('2026-10-18T23:59:59Z'),isoWeek:42,labelDa:'Historisk uge',
    }});
    expect(prepared.articles[0]?.id).toBe('historical');expect(f.read).not.toHaveBeenCalled();
  });
  it('fails closed for an invalid, missing or withdrawn selected feature',async()=>{
    f.read.mockResolvedValue({exists:true,data:()=>({articleId:'bad'})});
    await expect(getWeeklyNewsletterFeatureId(now)).rejects.toThrow('ugyldigt');
    f.read.mockResolvedValue({exists:true,data:()=>({articleId:bookId})});
    f.fetchArticles.mockResolvedValue({articles:[article('a')]});
    f.live.mockRejectedValue(new Error('Ugens feature er ikke en tilgængelig publiceret artikel.'));
    await expect(prepareWeeklyArticlesForDraft({referenceDate:now})).rejects.toThrow('publiceret');
  });
});
