import { expect, it } from 'vitest';
import { pendingTipKey, readPendingTip, savePendingTip, clearPendingTip } from '@/lib/editorial-tip-pending';
const tip = { operationId: 'f43458e0-f17e-4b33-8645-0c57e9ed8332', url: 'https://example.com/article', angle: 'En konkret kulturel vinkel' };
function store() {
  const values = new Map<string,string>();
  return { values, getItem: (k:string) => values.get(k) ?? null, setItem: (k:string,v:string) => { values.set(k,v); }, removeItem: (k:string) => { values.delete(k); } };
}
it('restores the exact same operation after a reload and keeps owners isolated', () => {
  const s = store(); savePendingTip(s, 'frederik', tip);
  expect(readPendingTip(s,'frederik')).toEqual(tip);
  expect(readPendingTip(s,'milo')).toBeNull();
  savePendingTip(s,'frederik',readPendingTip(s,'frederik')!);
  expect(s.values.size).toBe(1);
});
it('refuses replacement or deletion of another pending operation', () => {
  const s = store(); savePendingTip(s,'a',tip);
  expect(() => savePendingTip(s,'a',{...tip,angle:'En helt anden vinkel'})).toThrow('tip_receipt_changed');
  expect(() => clearPendingTip(s,'a','different')).toThrow('tip_receipt_changed');
  expect(readPendingTip(s,'a')).toEqual(tip);
  clearPendingTip(s,'a',tip.operationId); expect(readPendingTip(s,'a')).toBeNull();
});
it('does not silently discard damaged receipts or adopt another browser key', () => {
  const s = store(); s.setItem('apropos:pending-tip',JSON.stringify(tip));
  expect(readPendingTip(s,'a')).toBeNull();
  s.setItem(pendingTipKey('a'),'{broken');
  expect(() => readPendingTip(s,'a')).toThrow();
  expect(() => savePendingTip(s,'a',tip)).toThrow();
  expect(s.getItem(pendingTipKey('a'))).toBe('{broken');
});
it('refuses missing owners and bounds persisted data', () => {
  expect(() => pendingTipKey('')).toThrow();
  expect(pendingTipKey('a/b')).not.toBe(pendingTipKey('a%2Fb'));
  expect(() => savePendingTip(store(),'a',{...tip,angle:'x'.repeat(1501)})).toThrow();
});
it('propagates unavailable storage so callers cannot send without a saved receipt', () => {
  const s = store(); s.setItem = () => { throw new Error('quota'); };
  expect(() => savePendingTip(s,'a',tip)).toThrow('quota');
});
