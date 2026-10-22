import { mcpRequestAccess, oauthRateLimit, type McpIdentity } from '@/lib/mcp/oauth';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { PRIVATE_HEADERS } from '@/lib/mcp/config';
import { smallBody, sameOrigin } from '@/lib/mcp/http';
import { searchEditorialMail, readEditorialMail, saveEditorialReply, getEditorialReply, checkEditorialMailConnection, inspectEditorialSent, repairEditorialSent,composeEditorialMail,syncEditorialDraft,getEditorialMailThread,inspectEditorialDraft } from '@/lib/editorial-mail/service';
export const maxDuration = 120;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: PRIVATE_HEADERS });
/** Owner service surface for diagnostics and first-party drafts. No send/approval endpoint. */
export async function POST(req: Request) {
  const access = await mcpRequestAccess(req);
  if (!access?.owner) return json({ error: 'unauthorized' }, 403);
  try {
    sameOrigin(req);
    await oauthRateLimit(`editorial-mail-${access.uid}`, 120);
    const { action, input } = JSON.parse(await smallBody(req, 30000));
    const identity: McpIdentity = { ...access, scopes: ['apropos:read', 'apropos:draft'], grantId: 'first-party-mail' };
    const handlers = { search: searchEditorialMail, read: readEditorialMail, draft: saveEditorialReply, status: getEditorialReply, connection: checkEditorialMailConnection,
      inspect_sent: inspectEditorialSent, repair_sent: repairEditorialSent,compose:composeEditorialMail,sync_draft:syncEditorialDraft,thread:getEditorialMailThread,inspect_draft:inspectEditorialDraft };
    if (typeof action !== 'string' || !Object.hasOwn(handlers, action)) return json({ error: 'mcp_mail_action_invalid' }, 400);
    return json(await withoutPaidAi(() => handlers[action as keyof typeof handlers](identity, input)));
  } catch (e) {
    const error = e instanceof Error && /^mcp_mail_[a-z_]+$/.test(e.message) ? e.message : 'mcp_mail_invalid_request';
    console.warn('editorial_mail_request_failed', { error });
    return json({ error }, 400);
  }
}
