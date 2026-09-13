import { z } from 'zod';

const schema = z.object({ operationId: z.string().uuid(), url: z.string().max(2048), angle: z.string().min(10).max(1500) }).strict();
export type PendingTip = z.infer<typeof schema>;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function pendingTipKey(uid: string) {
  if (!uid) throw new Error('tip_owner_required');
  return `apropos:pending-tip:v1:${encodeURIComponent(uid)}`;
}
// Fail closed: unreadable/unwritable receipts must not create a different operation.
export function readPendingTip(store: Store, uid: string): PendingTip | null {
  const value = store.getItem(pendingTipKey(uid));
  if (value === null) return null;
  if (value.length > 6000) throw new Error('invalid_tip_receipt');
  return schema.parse(JSON.parse(value));
}
export function savePendingTip(store: Store, uid: string, tip: PendingTip) {
  const valid = schema.parse(tip);
  const existing = readPendingTip(store, uid);
  if (existing && JSON.stringify(existing) !== JSON.stringify(valid)) throw new Error('tip_receipt_changed');
  store.setItem(pendingTipKey(uid), JSON.stringify(valid));
}
export function clearPendingTip(store: Store, uid: string, operationId: string) {
  const stored = readPendingTip(store, uid);
  if (stored && stored.operationId !== operationId) throw new Error('tip_receipt_changed');
  store.removeItem(pendingTipKey(uid));
}
