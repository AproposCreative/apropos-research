import { z } from 'zod';

export const workspacePayloadSchema = z.object({
  messages: z.array(z.object({ id: z.string().max(200), role: z.enum(['user', 'assistant']),
    content: z.string().max(200000), timestamp: z.string().max(80).optional() }).passthrough()).max(1000),
  chatTitle: z.string().max(500), articleData: z.record(z.string(), z.unknown()),
  notes: z.string().max(200000), showWizard: z.boolean(), currentDraftId: z.string().max(200).nullable(),
}).strict();
export type WorkspacePayload = z.infer<typeof workspacePayloadSchema>;
export type WorkspaceSnapshot = { revision: number; data: WorkspacePayload; updatedAt: string };
export const workspaceSnapshotSchema = z.object({ revision: z.number().int().nonnegative(),
  data: workspacePayloadSchema, updatedAt: z.string() });
export const workspaceWriteSchema = z.object({ revision: z.number().int().nonnegative(), data: workspacePayloadSchema }).strict();
export const WORKSPACE_MAX_BYTES = 500000;
export const workspaceVersionSelectorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('history'), id: z.string().regex(/^\d{1,16}$/) }).strict(),
  z.object({ kind: z.literal('conflicts'), id: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export type WorkspaceVersionSelector = z.infer<typeof workspaceVersionSelectorSchema>;
export const workspaceRestoreSchema = z.object({ operationId: z.string().uuid(),
  revision: z.number().int().nonnegative(), selection: workspaceVersionSelectorSchema, local: workspacePayloadSchema }).strict();
