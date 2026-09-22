import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ access: vi.fn(), user: vi.fn(), list: vi.fn(), read: vi.fn(), confirm: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: () => ({ getUser: m.user }) }));
vi.mock('@/lib/liv/observations', () => ({ listObservationStories: m.list, readObservationBaseline: m.read, confirmObservation: m.confirm }));
import { GET, POST } from '@/app/api/liv/observations/route';
import { requiresEditorialOwner } from '@/lib/editorial-capabilities';
const url = 'https://app.example/api/liv/observations';
const input = { runId: 'prepare-2026-09-22', expectedCheckpointHash: 'a'.repeat(64), event: 'Koncert, hele aftenen',
  experiencedOn: '2026-09-20', articleQuote: 'Milo fik gåsehud til ekstranummeret.', observation: 'Jeg fik gåsehud under det sidste nummer.',
  confirmOwnExperience: true, shareWithEditorial: true };
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ uid: 'verified-user', owner: false });
  m.user.mockResolvedValue({ email: 'milo@aproposmagazine.com', emailVerified: true }); m.list.mockResolvedValue([]); m.confirm.mockResolvedValue({ status: 'confirmed' }); });
it('authenticates before reading private content', async () => {
  m.access.mockResolvedValue(null);
  expect((await GET(new NextRequest(url))).status).toBe(401);
  expect(m.list).not.toHaveBeenCalled();
});
it.each(['milo','casper','frederik'])('allows %s to confirm only their own identity without queue control', async name => {
  m.user.mockResolvedValue({ email: `${name}@aproposmagazine.com`, emailVerified: true });
  const response = await POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(input) }));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(m.confirm.mock.calls[0][1]).toBe('verified-user');
  expect(m.confirm.mock.calls[0][2]).toBe(name === 'frederik' ? 'Frederik Kragh' : name === 'casper' ? 'Casper' : 'Milo');
  expect(requiresEditorialOwner('/api/liv/observations','POST')).toBe(false);
  expect(requiresEditorialOwner('/api/liv/operations/publish','POST')).toBe(true);
});
it.each([{ email: 'milo@aproposmagazine.com', emailVerified: false }, { email: 'other@aproposmagazine.com', emailVerified: true },
  { email: 'milo@aproposmagazine.com', emailVerified: true, disabled: true }])('rejects disallowed identities', async user => {
  m.user.mockResolvedValue(user);
  expect((await GET(new NextRequest(url))).status).toBe(401); expect(m.list).not.toHaveBeenCalled();
});
it('rejects identity injection, huge bodies and unknown query parameters', async () => {
  for (const body of [{ ...input, witness: 'Frederik Kragh' }, { ...input, observation: 'x'.repeat(7000) }]) {
    expect((await POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body) }))).status).toBe(400);
  }
  expect((await GET(new NextRequest(url + '?uid=other'))).status).toBe(400);
  expect(m.confirm).not.toHaveBeenCalled();
});
it('hides infrastructure details', async () => {
  m.list.mockRejectedValue(Error('secret'));
  const response = await GET(new NextRequest(url)); expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret');
});
