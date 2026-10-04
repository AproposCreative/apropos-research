import { editorialRequestAccess } from '@/lib/editorial-access';
import { readPublication, approvePublication, publicationState } from '@/lib/mcp/publication';
import { json, smallBody, sameOrigin } from '@/lib/mcp/http';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const access = await editorialRequestAccess(request); if (!access?.owner) return json({ error: 'owner_required' }, 403);
  try {
    const row = await readPublication(access.uid, new URL(request.url).searchParams.get('id') || '');
    const current = await withoutPaidAi(() => publicationState(row.itemId));
    const pinned = row.expiresAt >= Date.now() && row.day === current.day && 'entry' in current &&
      row.payloadHash === current.entry.payloadHash && row.cmsHash === current.check.fieldDataHash;
    return json({ title: row.title, approved: row.approved, expiresAt: row.expiresAt,
      current: pinned ? current : { ready: false, blockers: ['Preview er ændret eller udløbet. Hent et nyt i ChatGPT.'] } });
  } catch { return json({ error: 'Preview kunne ikke hentes. Hent et nyt i ChatGPT.' }, 409); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const access = await editorialRequestAccess(request);
    if (!access?.owner) return json({ error: 'owner_required' }, 403);
    const body = JSON.parse(await smallBody(request));
    return json(await withoutPaidAi(() => approvePublication(access.uid, body.id)));
  } catch { return json({ error: 'Artiklen er ændret eller preview udløbet. Hent et nyt preview.' }, 409); }
}
