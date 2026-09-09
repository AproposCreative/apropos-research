import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ uid: 'editor' as string | null, prepare: vi.fn() }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: async () => mocks.uid }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }) }) }));
vi.mock('@/lib/liv/prepare-story-image', () => ({ prepareLivStoryImage: mocks.prepare }));
vi.mock('@/lib/editorial/engine', () => ({ discoverSignals: vi.fn(), runEditorialResearch: vi.fn() }));
vi.mock('@/lib/liv/generate-article', () => ({ generateLivArticle: vi.fn() }));
vi.mock('@/lib/editorial/audience-research', () => ({ fetchEditorialAudience: vi.fn() }));
import { POST } from '@/app/api/editorial/desk/route';
const input = { action: 'prepare-image', id: 'a'.repeat(64), url: 'https://museum.dk/hero.webp', alt: 'En udstillingssal', credit: 'Museet' };
const request = (body: object) => new NextRequest('https://app.example.com/api/editorial/desk', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.uid = 'editor'; });
describe('desk image action boundary', () => {
  it('requires authentication before processing an image', async () => {
    mocks.uid = null; const response = await POST(request(input)); expect(response.status).toBe(401); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('uses the authenticated owner, ignoring client-supplied owner or rights flags', async () => {
    mocks.prepare.mockResolvedValue({ id: 'saved', rightsStatus: 'unverified' });
    const response = await POST(request({ ...input, uid: 'victim', rightsStatus: 'approved' }));
    expect(response.status).toBe(200); expect(mocks.prepare).toHaveBeenCalledWith('editor', { id: input.id, url: input.url, alt: input.alt, credit: input.credit });
  });
  it.each([['image_storage_unavailable', 503], ['image_preparation_rate_limit', 429], ['image_selection_invalid', 400]])('returns a controlled JSON error for %s', async (error, status) => {
    mocks.prepare.mockRejectedValue(new Error(error as string)); const response = await POST(request(input));
    expect(response.status).toBe(status); expect(typeof (await response.json()).error).toBe('string');
  });
  it('does not expose upstream credentials or storage internals in an error', async () => {
    mocks.prepare.mockRejectedValue(new Error('https://example.com?token=private-test-marker'));
    const response = await POST(request(input)); expect(await response.text()).not.toContain('private-test-marker');
  });
});
