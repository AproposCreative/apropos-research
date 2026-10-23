import { z } from 'zod';
import type { McpIdentity } from './oauth';
import { repairEditorialSent } from '@/lib/editorial-mail/service';
import { repairAccreditationSent } from '@/lib/accreditation/mcp-drafts';

// Keep the established owner-only mail repair tool usable for both mail flows.
// Accreditation repairs carry the approved content hash in the same field so a
// stale view can never copy a newer mail. Neither branch invokes SMTP.
export const ownerSentRepairInput = z.object({
  draftId: z.string().regex(/^(?:[a-f0-9]{64}|mcp-[a-f0-9]{40}:[a-f0-9]{64})$/),
}).strict();

export async function repairOwnerSent(identity: McpIdentity, raw: unknown) {
  const { draftId } = ownerSentRepairInput.parse(raw);
  const accreditation = /^(mcp-[a-f0-9]{40}):([a-f0-9]{64})$/.exec(draftId);
  if (accreditation) return repairAccreditationSent(identity, {
    approvalId: accreditation[1], expectedHash: accreditation[2],
  });
  return repairEditorialSent(identity, { draftId });
}
