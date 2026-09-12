import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorized: false, run: vi.fn() }));
vi.mock('@/lib/seo-engine/secret-guards', () => ({ requireInternalApiSecret: () => mocks.authorized }));
vi.mock('@/lib/seo-engine/post-publish/runtime', () => ({ runProductionQualityJob: mocks.run }));
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/internal/seo-quality/route';

describe('internal metadata worker endpoint', () => {
  beforeEach(() => { mocks.authorized = false; mocks.run.mockReset(); });
  const request = (body: unknown) => new NextRequest('http://localhost/api/internal/seo-quality', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  it('never starts jobs without internal authorization', async () => {
    expect((await POST(request({ jobId: 'a'.repeat(64) }))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('rejects malformed document IDs even when authenticated', async () => {
    mocks.authorized = true;
    expect((await POST(request({ jobId: '../../other' }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('runs only the requested durable job', async () => {
    mocks.authorized = true;
    mocks.run.mockResolvedValue({ ok: true, status: 'kept' });
    const response = await POST(request({ jobId: 'a'.repeat(64) }));
    expect(await response.json()).toEqual({ ok: true, status: 'kept' });
    expect(mocks.run).toHaveBeenCalledWith('a'.repeat(64));
  });
});
