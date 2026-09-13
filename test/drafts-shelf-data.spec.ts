import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), where: vi.fn(), query: vi.fn(), collection: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ ...mocks, doc: vi.fn(), setDoc: vi.fn(), getDoc: vi.fn(), orderBy: vi.fn(), deleteDoc: vi.fn(), updateDoc: vi.fn(), serverTimestamp: vi.fn(), Timestamp: {} }));
import { getUserDrafts } from '@/lib/firebase-service';
beforeEach(() => vi.clearAllMocks());
it('queries only the requested owner and uses the real document ID, with empty messages supported', async () => {
  mocks.getDocs.mockResolvedValue({ forEach: (visit: Function) => visit({ id: 'real-id', data: () => ({ id: 'stale-id', userId: 'milo', title: 'Min kladde' }) }) });
  const drafts = await getUserDrafts('milo');
  expect(mocks.where).toHaveBeenCalledWith('userId', '==', 'milo');
  expect(drafts[0]).toMatchObject({ id: 'real-id', userId: 'milo', messages: [] });
});
it('keeps newest drafts first without requiring a new database index', async () => {
  mocks.getDocs.mockResolvedValue({ forEach: (visit: Function) => [1, 3, 2].forEach(n => visit({ id: String(n), data: () => ({ updatedAt: { toDate: () => new Date(n * 1000) } }) })) });
  expect((await getUserDrafts('frederik')).map(d => d.id)).toEqual(['3', '2', '1']);
});
