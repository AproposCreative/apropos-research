import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const research = vi.hoisted(() => vi.fn(() => { throw new Error('Preview must not research'); }));
const access = vi.hoisted(() => vi.fn(async () => ({ uid: 'editor' })));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: access }));
vi.mock('@/lib/research/service', () => ({ getResearch: research }));
import { POST } from '@/app/api/ai-chat/prompt-preview/route';
it('repeated previews never start paid research and disclose deferred web evidence', async () => {
  for (let i = 0; i < 2; i++) {
    const response = await POST(new NextRequest('http://localhost/api/ai-chat/prompt-preview', {
      method: 'POST', body: JSON.stringify({ articleData: { title: 'Klovn', researchSelected: { title: 'Klovn', summary: 'Eksisterende noter' } } }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const data = await response.json();
    expect(data.researchStatus).toBe('deferred_to_writer');
    expect(data.webContent).toBeNull();
    expect(data.nodes.length).toBeGreaterThan(0);
  }
  expect(research).not.toHaveBeenCalled();
});
it('denies unauthenticated previews before reading private context', async () => {
  access.mockResolvedValueOnce(null as never);
  const request = new NextRequest('http://localhost/api/ai-chat/prompt-preview', {method:'POST',body:'not-json'});
  const read = vi.spyOn(request, 'json');
  expect((await POST(request)).status).toBe(403);
  expect(read).not.toHaveBeenCalled();
});
