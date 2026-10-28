import {beforeEach,expect,it,vi} from 'vitest';
import {memoryFirestore} from './helpers/mcp-firestore';
const state=vi.hoisted(()=>({db:null as any,compress:vi.fn(),verifyDelivery:vi.fn(),lease:{assertOwned:vi.fn(),release:vi.fn()}}));
vi.mock('@/lib/firebase-admin',()=>({getAdminDb:()=>state.db}));
vi.mock('@/lib/config/env',()=>({env:{WEBFLOW_API_TOKEN:'test-only',WEBFLOW_ARTICLES_COLLECTION_ID:'collection'}}));
vi.mock('@/lib/webflow-config',()=>({getWebflowConfig:()=>({})}));
vi.mock('@/lib/seo-engine/cms-write-lease',()=>({acquireCmsWriteLease:async()=>state.lease}));
vi.mock('@/lib/webflow/locale-items',()=>({resolveWebflowLocaleIds:()=>({dk:'dk',en:'en'})}));
vi.mock('@/lib/webflow/article-image-auto-optimize',()=>({compressArticleFieldData:state.compress,isArticleImageAutoOptimizeEnabled:()=>true}));
vi.mock('@/lib/images/text-free',()=>({readEditorialImage:async()=>Buffer.from('same bytes'),imageByteHash:(v:Buffer)=>v.toString('hex')}));
vi.mock('@/lib/webflow/image-delivery-policy',()=>({IMAGE_DELIVERY_VERSION:'v2-test',verifyArticleImageDelivery:state.verifyDelivery}));
import {cmsFieldHash} from '@/lib/liv/cms-field-hash';
import {optimizePublishedArticleImages,verifyCompressedFields} from '@/lib/webflow/published-image-optimization';
import {shouldRunImageOptimize} from '@/lib/seo-engine/webhook-decisions';
const id='6ac7a31e994128467aa26e6a';
const original={name:'Human review',content:'<p>Human copy</p>',stjerne:4,author:'peter',thumb:{url:'https://cdn.test/hero.webp',alt:'Hero'}};
let live:any,staged:any,fetchMock:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  vi.clearAllMocks();state.verifyDelivery.mockResolvedValue({version:'v2-test',verifiedImages:2});state.db=memoryFirestore().db;
  live={id,cmsLocaleId:'dk',fieldData:structuredClone(original),lastPublished:'2026-10-08T14:14:06Z'};
  staged=structuredClone(live);
  state.compress.mockImplementation(async({fieldData})=>{fieldData.content='<p>Human copy</p><img src="https://cdn.test/encoded.webp">';return{thumbOptimized:false,mobileOptimized:false,contentImagesOptimized:1,contentImagesFailed:0};});
  fetchMock=vi.fn(async(url:string,init?:RequestInit)=>{
    if(init?.method==='PATCH'){
      const data=JSON.parse(String(init.body));Object.assign(live.fieldData,data.items[0].fieldData);staged=structuredClone(live);return Response.json({items:[live]});
    }
    return Response.json(url.includes('/live?')?live:staged);
  });vi.stubGlobal('fetch',fetchMock);
});
it('patches only changed media fields in the correct locale, preserves author/rating and verifies',async()=>{
  const result=await optimizePublishedArticleImages(id,'dk');expect(result).toMatchObject({patched:true,cmsVerified:true});
  const calls=fetchMock.mock.calls.filter(([,i])=>i?.method==='PATCH');expect(calls).toHaveLength(1);
  expect(JSON.parse(String(calls[0][1]?.body))).toEqual({items:[{id,cmsLocaleId:'dk',fieldData:{content:'<p>Human copy</p><img src="https://cdn.test/encoded.webp">'}}]});
  expect(live.fieldData.stjerne).toBe(4);expect(live.fieldData.author).toBe('peter');
});
it('never publishes an unpublished draft or pending editor changes',async()=>{
  staged.fieldData.name='Unapproved edit';expect(await optimizePublishedArticleImages(id,'dk')).toMatchObject({reason:'unpublished_changes'});
  expect(state.compress).not.toHaveBeenCalled();
  staged=structuredClone(live);live.isDraft=true;expect(await optimizePublishedArticleImages(id,'dk')).toMatchObject({reason:'not_published'});
});
it('rechecks staged/live state after encoding to prevent overwriting newer work',async()=>{
  state.compress.mockImplementation(async({fieldData})=>{fieldData.content='encoded';staged.fieldData.name='new edit';return{contentImagesFailed:0};});
  await expect(optimizePublishedArticleImages(id,'dk')).rejects.toThrow('cms_conflict');
  expect(fetchMock.mock.calls.some(([,i])=>i?.method==='PATCH')).toBe(false);
});
it('reconciles a timeout after the provider applied the write without repeating it',async()=>{
  const originalFetch=fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async(url,init)=>{const r=await originalFetch(url,init);if(init?.method==='PATCH')throw Error('timeout');return r;});
  expect(await optimizePublishedArticleImages(id,'dk')).toMatchObject({cmsVerified:true});
  expect(fetchMock.mock.calls.filter(([,i])=>i?.method==='PATCH')).toHaveLength(1);
});
it('never reissues an ambiguous write after timeout before application',async()=>{
  const originalFetch=fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async(url,init)=>{if(init?.method==='PATCH')throw Error('timeout');return originalFetch(url,init);});
  await expect(optimizePublishedArticleImages(id,'dk')).rejects.toThrow('timeout');
  await expect(optimizePublishedArticleImages(id,'dk')).rejects.toThrow('write_unconfirmed');
  expect(fetchMock.mock.calls.filter(([,i])=>i?.method==='PATCH')).toHaveLength(1);
});
it('rejects unknown locales and partial optimization',async()=>{
  await expect(optimizePublishedArticleImages(id,'invalid')).rejects.toThrow('unknown_locale');
  state.compress.mockResolvedValue({contentImagesFailed:1});await expect(optimizePublishedArticleImages(id,'dk')).rejects.toThrow('incomplete');
  expect(fetchMock.mock.calls.some(([,i])=>i?.method==='PATCH')).toBe(false);
});
it('uses EN explicitly, not the primary locale',async()=>{
  live.cmsLocaleId=staged.cmsLocaleId='en';await optimizePublishedArticleImages(id,'en');
  expect(fetchMock.mock.calls.filter(([,i])=>i?.method!=='PATCH').every(([u])=>u.includes('cmsLocaleId=en'))).toBe(true);
});
it('readback rejects changed credit/alt/editorial fields despite valid asset bytes',async()=>{
  await expect(verifyCompressedFields(original,{...original,author:'wrong'},['thumb'])).rejects.toThrow('readback_mismatch');
  await expect(verifyCompressedFields(original,{...original,thumb:{url:'https://other.test/same.webp',alt:'wrong'}},['thumb'])).rejects.toThrow('alt_mismatch');
});
it('created events cannot auto-publish new items',()=>{
  expect(shouldRunImageOptimize({imageOptOn:true,autoSeoOn:false,autoTranslateOn:false,isPrimaryLocale:true,triggerType:'collection_item_created'})).toBe(false);
});

it('reconsiders an old locked no-op, retaining dated evidence and then verifies idempotently',async()=>{
 const ref=state.db.collection('webflowArticleImageAutoOptimize').doc(cmsFieldHash({policy:'published-compression-2026-10-09-v1',itemId:id,cmsLocaleId:'dk',beforeHash:cmsFieldHash(original)}));
 await ref.set({status:'no_changes',checkedAt:'2026-10-28T15:35:34Z',result:{contentImagesOptimized:0}});
 expect(await optimizePublishedArticleImages(id,'dk')).toMatchObject({patched:true});
 expect((await ref.get()).data()).toMatchObject({status:'complete',previousNoChanges:{checkedAt:'2026-10-28T15:35:34Z'}});
 state.compress.mockImplementation(async()=>({contentImagesFailed:0}));
 await optimizePublishedArticleImages(id,'dk');await optimizePublishedArticleImages(id,'dk');
 expect(fetchMock.mock.calls.filter(([,i])=>i?.method==='PATCH')).toHaveLength(1);
});
it('does not call an unchanged but oversized file compliant or write an incomplete derivative',async()=>{
 state.verifyDelivery.mockRejectedValue(Error('image_delivery_noncompliant:thumb'));
 await expect(optimizePublishedArticleImages(id,'dk')).rejects.toThrow('noncompliant');
 expect(fetchMock.mock.calls.filter(([,i])=>i?.method==='PATCH')).toHaveLength(0);
});
it('handles live API change events without enabling translation or draft publishing',()=>{
 expect(shouldRunImageOptimize({imageOptOn:true,autoSeoOn:false,autoTranslateOn:false,isPrimaryLocale:false,triggerType:'collection_item_changed'})).toBe(true);
});
