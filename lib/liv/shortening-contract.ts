import { z } from 'zod';

export const shorteningProposalInput = z.object({
  itemId: z.string().regex(/^[a-f0-9]{24}$/), requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/), expectedCmsHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetWords: z.number().int().min(450).max(650),
}).strict();
export const shorteningEdits = z.object({ bodyEdits: z.array(z.object({
  index: z.number().int().nonnegative(), before: z.string().max(6000), after: z.string().max(6000),
}).strict()).min(1).max(60) }).strict();
