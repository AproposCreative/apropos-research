import { z } from 'zod';
import type { McpIdentity } from './oauth';
import { repairEditorialSent } from '@/lib/editorial-mail/service';
import { getAccreditationDraft, repairAccreditationSent } from '@/lib/accreditation/mcp-drafts';

// Keep the established owner-only mail repair tool usable for both mail flows.
// The connector caches its original 64-hex ID schema, so accreditation repairs
// use a namespaced 64-hex key: marker + approval ID + version-hash prefix.
// The server resolves the full immutable version before any IMAP operation.
const accreditationMarker = 'accd17';
export const ownerSentRepairInput = z.object({
  draftId: z.string().regex(/^(?:[a-f0-9]{64}|mcp-[a-f0-9]{40})$/),
}).strict();

export function accreditationSentRepairKey(approvalId: string, expectedHash: string) {
  const id = z.string().regex(/^mcp-[a-f0-9]{40}$/).parse(approvalId);
  const version = z.string().regex(/^[a-f0-9]{64}$/).parse(expectedHash);
  return `${accreditationMarker}${id.slice(4)}${version.slice(0, 18)}`;
}

export async function repairOwnerSent(identity: McpIdentity, raw: unknown) {
  const { draftId } = ownerSentRepairInput.parse(raw);
  if (draftId.startsWith('mcp-')) {
    const current = await getAccreditationDraft(identity, { approvalId: draftId });
    return repairAccreditationSent(identity, { approvalId: draftId, expectedHash: current.contentHash });
  }
  if (draftId.startsWith(accreditationMarker)) {
    const approvalId = `mcp-${draftId.slice(6, 46)}`;
    const hashPrefix = draftId.slice(46);
    const current = await getAccreditationDraft(identity, { approvalId }).catch(error => {
      // Preserve historic editorial IDs even in the improbable marker collision.
      if (error instanceof Error && error.message === 'mcp_accreditation_draft_not_found') return null;
      throw error;
    });
    if (current) {
      if (!current.contentHash.startsWith(hashPrefix)) throw Error('mcp_accreditation_draft_changed');
      return repairAccreditationSent(identity, { approvalId, expectedHash: current.contentHash });
    }
  }
  return repairEditorialSent(identity, { draftId });
}
