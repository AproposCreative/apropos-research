import { expect, it } from 'vitest';
import { workspaceWriteSchema } from '@/lib/writer-workspace';
import { writerGenerationProvenance } from '@/lib/ai-chat/generation-provenance';
const data = { messages: [], chatTitle: 'Kladde', articleData: {}, notes: '', showWizard: true, currentDraftId: null };
it('accepts saved work and optimistic revision', () => {
  expect(workspaceWriteSchema.safeParse({ revision: 0, data }).success).toBe(true);
});
it('retains generation provenance with a saved private draft', () => {
  const generationProvenance = writerGenerationProvenance({ modelRequested: 'configured-model',
    modelReturned: 'actual-model-version', temperature: null, systemPrompt: 'instructions',
    segments: [], response: 'retained draft', requestMessages: [] });
  const saved = workspaceWriteSchema.parse({ revision: 1,
    data: { ...data, articleData: { content: 'retained draft', generationProvenance } } });
  expect(saved.data.articleData.generationProvenance).toEqual(generationProvenance);
});
it('rejects forged ownership and invalid revisions', () => {
  expect(workspaceWriteSchema.safeParse({ revision: 0, data, userId: 'another-user' }).success).toBe(false);
  expect(workspaceWriteSchema.safeParse({ revision: -1, data }).success).toBe(false);
  expect(workspaceWriteSchema.safeParse({ revision: 0, data: { ...data, userId: 'another-user' } }).success).toBe(false);
});
