import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const m = vi.hoisted(() => ({ authenticated: true, locks: vi.fn(), history: vi.fn() }));
vi.mock('@/lib/seo-engine/require-auth', () => ({ requireSeoEngineUser: async () => m.authenticated
  ? { ok: true, userId: 'editor' } : { ok: false, response: new NextResponse(null, { status: 401 }) } }));
vi.mock('@/lib/seo-engine/post-publish/editorial', () => ({ setMetadataLocks: m.locks, listMetadataHistory: m.history }));
import { GET, POST } from '../../../app/api/seo-engine/quality/route';
const request = (body: unknown) => new NextRequest('http://localhost/api/seo-engine/quality', { method: 'POST', body: JSON.stringify(body) });
describe('editorial metadata control', () => {
  beforeEach(() => { m.authenticated = true; m.locks.mockReset(); m.history.mockReset(); });
  it('rejects anonymous reads and writes', async () => {
    m.authenticated = false;
    expect((await GET(new NextRequest('http://localhost/api/seo-engine/quality'))).status).toBe(401);
    expect((await POST(request({}))).status).toBe(401);
    expect(m.history).not.toHaveBeenCalled(); expect(m.locks).not.toHaveBeenCalled();
  });
  it('allows only known metadata fields and locale IDs', async () => {
    expect((await POST(request({ itemId: 'a'.repeat(24), locale: 'da', lockedFields: ['content'] }))).status).toBe(400);
    expect((await POST(request({ itemId: 'a'.repeat(24), locale: 'fr', lockedFields: [] }))).status).toBe(400);
    expect(m.locks).not.toHaveBeenCalled();
  });
  it('records an authenticated per-field lock without accepting an impersonated actor', async () => {
    m.locks.mockResolvedValue({ lockedFields: ['seoTitle'] });
    const response = await POST(request({ itemId: 'a'.repeat(24), locale: 'en', lockedFields: ['seoTitle'] }));
    expect(response.status).toBe(200);
    expect(m.locks).toHaveBeenCalledWith('a'.repeat(24), 'en', ['seoTitle'], 'editor');
  });
  it('reports contention rather than claiming the lock was saved', async () => {
    m.locks.mockRejectedValue(Object.assign(new Error('busy'), { code: 'write_busy' }));
    expect((await POST(request({ itemId: 'a'.repeat(24), locale: 'da', lockedFields: [] }))).status).toBe(409);
  });
});
