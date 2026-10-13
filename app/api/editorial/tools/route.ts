import { verifyEditorialToken } from '@/lib/editorial-access';
import { readProviderHold } from '@/lib/ai/provider-hold';
import { getAgentControl } from '@/lib/accreditation/agent-control';
import { getLivInboxSettings } from '@/lib/liv-inbox/settings-store';
import { describeTools } from '@/lib/tool-availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const nullable = async <T,>(read: () => Promise<T>): Promise<T | null> => { try { return await read(); } catch { return null; } };

/** Stored flags only: no AI, cron, mailbox sync, sending or credential probes. */
export async function GET(request: Request) {
  const bearer = request.headers.get('authorization') || '';
  const access = bearer.startsWith('Bearer ') ? await verifyEditorialToken(bearer.slice(7)) : null;
  if (!access) return Response.json({ error: 'Log ind for at se værktøjer.' }, { status: 401, headers });
  const [paidAiBlocked, accreditationPaused, inboxAutoRespond] = await Promise.all([
    nullable(async () => (await readProviderHold()).blocked),
    nullable(async () => (await getAgentControl()).paused),
    access.owner ? nullable(async () => (await getLivInboxSettings()).autoRespond) : Promise.resolve(null),
  ]);
  return Response.json({ checkedAt: new Date().toISOString(), tools: describeTools({
    paidAiBlocked, accreditationPaused, inboxAutoRespond,
  }, { owner: access.owner }) }, { headers });
}
