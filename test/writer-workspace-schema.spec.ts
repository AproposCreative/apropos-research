import { expect, it } from 'vitest';
import { workspaceWriteSchema } from '@/lib/writer-workspace';
const data = { messages: [], chatTitle: 'Kladde', articleData: {}, notes: '', showWizard: true, currentDraftId: null };
it('accepts saved work and optimistic revision', () => {
  expect(workspaceWriteSchema.safeParse({ revision: 0, data }).success).toBe(true);
});
it('rejects forged ownership and invalid revisions', () => {
  expect(workspaceWriteSchema.safeParse({ revision: 0, data, userId: 'another-user' }).success).toBe(false);
  expect(workspaceWriteSchema.safeParse({ revision: -1, data }).success).toBe(false);
  expect(workspaceWriteSchema.safeParse({ revision: 0, data: { ...data, userId: 'another-user' } }).success).toBe(false);
});
