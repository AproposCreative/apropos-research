import { z } from 'zod';
import { EDITORIAL_EMAILS } from './auth-policy';

const schema = z.object({ operationId: z.uuid(), revision: z.number().int().positive(), recipient: z.enum(EDITORIAL_EMAILS) }).strict();
export type WorkspaceShareReceipt = z.infer<typeof schema>;
type ReceiptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (uid: string) => `writer-share-pending:v1:${encodeURIComponent(uid)}`;

// Metadata only, never draft content or tokens. No legacy/shared-account keys.
export function readShareReceipt(storage: ReceiptStorage, uid: string): WorkspaceShareReceipt | null {
  const raw = storage.getItem(key(uid));
  if (!raw) return null;
  return schema.parse(JSON.parse(raw));
}
export function writeShareReceipt(storage: ReceiptStorage, uid: string, receipt: WorkspaceShareReceipt) {
  storage.setItem(key(uid), JSON.stringify(schema.parse(receipt)));
}
export function clearShareReceipt(storage: ReceiptStorage, uid: string) { storage.removeItem(key(uid)); }
