import { AsyncLocalStorage } from 'node:async_hooks';
// Independent of cost scopes: nested calls cannot accidentally opt back into spending.
const noPaid = new AsyncLocalStorage<boolean>();
export const withoutPaidAi = <T>(run: () => T): T => noPaid.run(true, run);
export function assertPaidAiAllowed() {
  if (noPaid.getStore()) throw new Error('mcp_paid_call_requires_separate_approval');
}
