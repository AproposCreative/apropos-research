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
