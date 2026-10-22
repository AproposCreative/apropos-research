import { mcpRequestAccess, oauthRateLimit, type McpIdentity } from '@/lib/mcp/oauth';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { PRIVATE_HEADERS } from '@/lib/mcp/config';
import { smallBody, sameOrigin } from '@/lib/mcp/http';
import { getAccreditationContext, searchAccreditationContacts, listAccreditationRequests, getAccreditationRequest } from '@/lib/accreditation/mcp-context';
import { researchAccreditationEvent } from '@/lib/accreditation/mcp-research';
import { saveAccreditationRequest, setAccreditationOutcome, linkAccreditationMail, syncAccreditationSheet } from '@/lib/accreditation/mcp-cases';
import { saveAccreditationDraft, getAccreditationDraft } from '@/lib/accreditation/mcp-drafts';
export const maxDuration = 120;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: PRIVATE_HEADERS });
/** Owner diagnostics/first-party data only. No endpoint issues consent or sends mail. */
export async function POST(req: Request) {
  const access = await mcpRequestAccess(req);
  if (!access?.owner) return json({ error: 'unauthorized' }, 403);
  try {
    sameOrigin(req); await oauthRateLimit(`accreditation-mcp-${access.uid}`, 120);
    const { action, input } = JSON.parse(await smallBody(req, 40000));
    const identity: McpIdentity = { ...access, scopes: ['apropos:read', 'apropos:draft'], grantId: 'first-party-accreditation' };
    const handlers = { context: getAccreditationContext, contacts: searchAccreditationContacts, research: researchAccreditationEvent, list: listAccreditationRequests, read: getAccreditationRequest,
      save: saveAccreditationRequest, outcome: setAccreditationOutcome, link: linkAccreditationMail, sync: syncAccreditationSheet,
      draft: saveAccreditationDraft, status: getAccreditationDraft };
    if (typeof action !== 'string' || !Object.hasOwn(handlers, action)) return json({ error: 'mcp_accreditation_action_invalid' }, 400);
    return json(await withoutPaidAi(() => handlers[action as keyof typeof handlers](identity, input)));
  } catch (e) {
    const error = e instanceof Error && /^mcp_(accreditation|mail)_[a-z_]+$/.test(e.message) ? e.message : 'mcp_accreditation_invalid_request';
    console.warn('editorial_accreditation_request_failed', { error }); return json({ error }, 400);
  }
}
