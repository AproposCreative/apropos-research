import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m=vi.hoisted(()=>({uid:vi.fn(),where:vi.fn(),limit:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/newsletter/auth-request',()=>({getNewsletterUserIdFromRequest:m.uid}));
vi.mock('@/lib/firebase-admin',()=>({getAdminDb:()=>({collection:()=>({where:m.where})})}));
import { personalSourcePolicy } from '@/lib/ai-chat/personal-source-policy';
const request=new NextRequest('https://studio.test/api/ai-chat',{headers:{'x-user-id':'forged'}});
beforeEach(()=>{vi.resetAllMocks();m.uid.mockResolvedValue('actual');m.where.mockReturnValue({limit:m.limit});m.limit.mockReturnValue({get:m.get});m.get.mockResolvedValue({size:1,docs:[{data:()=>({baseUrl:'https://publisher.example',enabled:false})}]});});
it('loads only the authenticated account and ignores caller IDs',async()=>{
 expect(await personalSourcePolicy(request)).toEqual({preferred:[],excluded:['publisher.example']});
 expect(m.where).toHaveBeenCalledWith('userId','==','actual');expect(m.limit).toHaveBeenCalledWith(101);
});
it('does not load personal settings for internal generation',async()=>{
 m.uid.mockResolvedValue(null);expect(await personalSourcePolicy(request)).toBeUndefined();expect(m.where).not.toHaveBeenCalled();
});
it('fails visibly instead of researching with lost preferences',async()=>{
 m.get.mockRejectedValue(new Error('storage down'));await expect(personalSourcePolicy(request)).rejects.toThrow('kildevalg');
});
it('does not silently truncate a source policy',async()=>{
 m.get.mockResolvedValue({size:101,docs:[]});await expect(personalSourcePolicy(request)).rejects.toThrow('kildevalg');
});
