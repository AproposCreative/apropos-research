import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const s=vi.hoisted(()=>({saved:Buffer.alloc(0),save:vi.fn(),download:vi.fn(),meta:vi.fn(),path:''}));
vi.mock('@/lib/firebase-admin',()=>({getAdminStorageBucket:()=>({name:'test-bucket',file:(path:string)=>{
  s.path=path;return {save:s.save,download:s.download,getMetadata:s.meta};}})}));
import { attachSuppliedCover } from '@/lib/liv/supplied-cover';
const article:any={title:'Book',slug:'book',intro:'Intro',content:'Original prose',preparedMedia:[{role:'hero',url:'old'},{role:'body-1',url:'one'},{role:'body-2',url:'two'}]};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('FIREBASE_STORAGE_BUCKET','test-bucket');s.save.mockImplementation(async(b:Buffer)=>{s.saved=b;});s.download.mockImplementation(async()=>[s.saved]);});
afterEach(()=>vi.unstubAllEnvs());
const cover=async(width=1280,height=720)=>({base64:(await sharp({create:{width,height,channels:3,background:'#bca879'}}).jpeg().toBuffer()).toString('base64'),
  alt:'Bogen på et træbord',credit:'Brugerleveret billede; fotograf ikke oplyst',preservePrintedBookTitle:true as const});
it('validates pixels, optimizes without enlargement, reads back bytes, preserves body and records editorial not AI review',async()=>{
  const result=await attachSuppliedCover(article,await cover());
  expect(result.content).toBe(article.content);expect(result.preparedMedia.slice(1)).toEqual(article.preparedMedia.slice(1));
  expect(result.selectedImage).toMatchObject({width:1200,height:675,visualReview:'editorial',rightsStatus:'unverified'});
  expect(result.selectedImage.bytes).toBeLessThan(450*1024);expect(s.path).toMatch(/^editorial-images\/liv-supplied\/[a-f0-9]{64}\/hero-/);
  expect((await sharp(s.saved).metadata()).format).toBe('webp');expect(s.download).toHaveBeenCalledOnce();
});
it('rejects too-small images and invalid image input before uploading',async()=>{
  await expect(attachSuppliedCover(article,await cover(300,200))).rejects.toThrow('liv_supplied_cover_invalid');
  await expect(attachSuppliedCover(article,{...await cover(),base64:'<script>'})).rejects.toThrow();expect(s.save).not.toHaveBeenCalled();
});
it('rejects corrupt storage readback and preserves immutable upload collision semantics',async()=>{
  s.download.mockResolvedValue([Buffer.from('wrong')]);await expect(attachSuppliedCover(article,await cover())).rejects.toThrow('liv_supplied_cover_storage');
  s.save.mockRejectedValue({code:412});s.meta.mockResolvedValue([{metadata:{firebaseStorageDownloadTokens:'not-a-token'}}]);
  await expect(attachSuppliedCover(article,await cover())).rejects.toThrow('liv_supplied_cover_storage');
});
