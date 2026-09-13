import { expect, it } from 'vitest';
import { readShareReceipt, writeShareReceipt, clearShareReceipt } from '@/lib/workspace-share-receipt';

const receipt = { operationId: '1699e4b7-ed34-4453-8bd5-23854a98437a', revision: 7, recipient: 'casper@aproposmagazine.com' as const };
const storage = () => {
  const values = new Map<string,string>();
  return { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value); }, removeItem: (key:string) => { values.delete(key); } };
};
it('retains exact operation across remounts and isolates accounts', () => {
  const s = storage(); writeShareReceipt(s,'frederik',receipt);
  expect(readShareReceipt(s,'frederik')).toEqual(receipt);
  expect(readShareReceipt(s,'milo')).toBeNull();
  clearShareReceipt(s,'milo'); expect(readShareReceipt(s,'frederik')).toEqual(receipt);
  clearShareReceipt(s,'frederik'); expect(readShareReceipt(s,'frederik')).toBeNull();
});
it('refuses malformed receipts and unexpected private payloads', () => {
  const s = storage();
  expect(() => writeShareReceipt(s,'frederik',{...receipt, notes:'private'} as any)).toThrow();
  expect(() => writeShareReceipt(s,'frederik',{...receipt, recipient:'outside@example.com'} as any)).toThrow();
  s.setItem('writer-share-pending:v1:frederik','broken');
  expect(() => readShareReceipt(s,'frederik')).toThrow();
});
it('does not disguise unavailable storage as a safely saved receipt', () => {
  const s = storage(); s.setItem = () => { throw new Error('Storage unavailable'); };
  expect(() => writeShareReceipt(s,'frederik',receipt)).toThrow('Storage unavailable');
});
