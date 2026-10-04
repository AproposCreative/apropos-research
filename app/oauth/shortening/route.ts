import { editorialRequestAccess } from '@/lib/editorial-access';
import { getExternalShortening, confirmExternalShortening, shorteningIdInput, shorteningConfirmationInput } from '@/lib/mcp/shortening';
import { json, smallBody, sameOrigin } from '@/lib/mcp/http';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const access = await editorialRequestAccess(request); if (!access?.owner) return json({ error: 'owner_required' }, 403);
  try {
    const params = new URL(request.url).searchParams;
    const input = shorteningIdInput.parse(Object.fromEntries(params));
    if ([...params.keys()].length !== 1) throw Error('invalid');
    return json(await withoutPaidAi(() => getExternalShortening(access.uid, input.proposalId)));
  } catch { return json({ error: 'Forslaget kunne ikke bekræftes. Bevar samme link og kontrollér status igen.' }, 409); }
}
export async function POST(request: Request) {
  const access = await editorialRequestAccess(request); if (!access?.owner) return json({ error: 'owner_required' }, 403);
  try {
    sameOrigin(request);
    const input = shorteningConfirmationInput.parse(JSON.parse(await smallBody(request, 2000)));
    return json(await withoutPaidAi(() => confirmExternalShortening(access.uid, input)));
  } catch { return json({ error: 'Godkendelsen kunne ikke bekræftes. Genindlæs det samme forslag; artiklen kan være ændret.' }, 409); }
}
