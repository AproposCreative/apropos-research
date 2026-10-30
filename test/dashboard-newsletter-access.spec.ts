import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m=vi.hoisted(()=>({auth:vi.fn(),recipients:vi.fn(),dashboard:vi.fn()}));
vi.mock('@/lib/editorial-access',()=>({editorialRequestAccess:m.auth}));
vi.mock('@/lib/newsletter/get-recipients',()=>({getNewsletterRecipients:m.recipients}));
vi.mock('@/lib/dashboard/newsletter-data',()=>({fetchNewsletterDashboard:m.dashboard}));
import {GET} from '@/app/api/dashboard/newsletter/route';
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({uid:'colleague',owner:false});m.recipients.mockResolvedValue({emails:['private@example.test'],verified:true});m.dashboard.mockResolvedValue({audience:[{email:'private@example.test',active:true}],campaigns:[]});});
it('rejects staff and spoofed owner parameters before reading private addresses',async()=>{
 const response=await GET(new NextRequest('https://example.test/api/dashboard/newsletter?owner=true&uid=frederik'));
 expect(response.status).toBe(403);expect(m.recipients).not.toHaveBeenCalled();expect(m.dashboard).not.toHaveBeenCalled();expect(JSON.stringify(await response.json())).not.toContain('private@');
});
it('returns private no-store subscriber details only to the verified owner',async()=>{
 m.auth.mockResolvedValue({uid:'owner',owner:true});const response=await GET(new NextRequest('https://example.test/api/dashboard/newsletter?period=7d'));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect((await response.json()).data.audience[0].email).toBe('private@example.test');expect(m.dashboard).toHaveBeenCalledWith('7d',expect.any(Object));
});
it('requires login and never exposes provider errors or credentials',async()=>{
 m.auth.mockResolvedValueOnce(null);expect((await GET(new NextRequest('https://example.test/api/dashboard/newsletter'))).status).toBe(401);
 m.auth.mockResolvedValue({uid:'owner',owner:true});m.dashboard.mockRejectedValue(Error('secret-api-token'));
 const response=await GET(new NextRequest('https://example.test/api/dashboard/newsletter'));
 expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('secret');
});
