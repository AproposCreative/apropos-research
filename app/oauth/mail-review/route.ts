import { z } from 'zod';
import { mcpRequestAccess, oauthRateLimit, opaque, digest, type McpIdentity } from '@/lib/mcp/oauth';
import { json, sameOrigin, smallBody } from '@/lib/mcp/http';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { getEditorialReply, previewEditorialReply, confirmEditorialReply, saveEditorialReply,
  syncEditorialDraft, getEditorialMailThread } from '@/lib/editorial-mail/service';

export const maxDuration = 120;
const COOKIE = '__Host-apropos-mail-review';
const inputSchema = z.object({
  draftId: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.enum(['preview_editorial_reply', 'confirm_editorial_reply', 'save_editorial_reply', 'sync_editorial_draft', 'get_editorial_mail_thread']),
  input: z.record(z.string(), z.unknown()),
}).strict();

/** Browser UI only. No new model tool or send permission on the service API.
 * Opening the page only previews. The existing immutable confirmation service
 * sends only after the owner's explicit button click, never on GET/initial load.
 */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const access = await mcpRequestAccess(request);
    if (!access?.owner) return json({ error: 'mcp_mail_owner_required' }, 403);
    await oauthRateLimit(`mail-review-${access.uid}`, 120);
    const { draftId, name, input } = inputSchema.parse(JSON.parse(await smallBody(request, 30000)));
    const existing = request.headers.get('cookie')?.split(';').map(s => s.trim())
      .find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    const cookie = existing && /^[A-Za-z0-9_-]{43}$/.test(existing) ? existing : null;
    if (!cookie && name !== 'preview_editorial_reply') return json({ error: 'mcp_mail_confirmation_required' }, 403);
    const browser = cookie || opaque();
    // UI consent cannot be transplanted between browsers, drafts or MCP grants.
    const identity: McpIdentity = { ...access, scopes: ['apropos:read', 'apropos:draft', 'apropos:publish'],
      grantId: `mail-review:${digest(browser)}:${draftId}` };
    const result = await withoutPaidAi(async () => {
      if (name === 'preview_editorial_reply') {
        if (input.draftId !== draftId || Object.keys(input).length !== 1) throw Error('mcp_mail_reply_changed');
        const { data, confirmation } = await previewEditorialReply(identity, { draftId });
        return { structuredContent: data, _meta: { confirmation } };
      }
      const current = await getEditorialReply(identity, { draftId });
      let data;
      if (name === 'confirm_editorial_reply') {
        if (input.displayedHash !== current.contentHash) throw Error('mcp_mail_reply_changed');
        data = await confirmEditorialReply(identity, input);
      } else if (name === 'save_editorial_reply') {
        if (input.messageId !== current.source.id || input.expectedSourceHash !== current.source.sourceHash) throw Error('mcp_mail_source_changed');
        data = await saveEditorialReply(identity, input);
      } else {
        if (input.draftId !== draftId) throw Error('mcp_mail_reply_changed');
        data = name === 'sync_editorial_draft' ? await syncEditorialDraft(identity, input) : await getEditorialMailThread(identity, input);
      }
      return { structuredContent: data };
    });
    const response = json(result);
    if (!cookie) response.headers.set('Set-Cookie', `${COOKIE}=${browser}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600`);
    return response;
  } catch (cause) {
    const error = cause instanceof Error && /^mcp_mail_[a-z_]+$/.test(cause.message) ? cause.message : 'mcp_mail_invalid_request';
    console.warn('editorial_mail_review_failed', { error });
    return json({ error }, 400);
  }
}
