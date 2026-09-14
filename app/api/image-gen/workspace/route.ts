import { editorialRequestAccess } from '@/lib/editorial-access';
import { readImageGenWorkspace, writeImageGenWorkspace } from '@/lib/image-gen/workspace';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  try { return Response.json(await readImageGenWorkspace(access.uid), { headers }); }
  catch { return Response.json({ error: 'Dit arbejdsrum kunne ikke hentes.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  const text = await request.text();
  if (text.length > 30000) return Response.json({ error: 'too_large' }, { status: 413, headers });
  try { const body = JSON.parse(text); return Response.json(await writeImageGenWorkspace(access.uid, body.revision, body.state), { headers }); }
  catch { return Response.json({ error: 'Arbejdsrummet er ændret i en anden fane eller kunne ikke gemmes. Genindlæs før du fortsætter.' }, { status: 409, headers }); }
}
