import { editorialRequestAccess } from '@/lib/editorial-access';
import { readImageGenStyleConfig, updateImageGenStyle } from '@/lib/image-gen/style-config';
import type { AproposImageStyle } from '@/lib/image-gen/styles';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await editorialRequestAccess(request)) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  try { return Response.json(await readImageGenStyleConfig(), { headers }); }
  catch { return Response.json({ error: 'Stilregler kunne ikke hentes.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access?.owner) return Response.json({ error: 'Kun Frederik kan ændre stilreglerne.' }, { status: 403, headers });
  if (Number(request.headers.get('content-length') ?? 0) > 2_100_000) return Response.json({ error: 'too_large' }, { status: 413, headers });
  try {
    const form = await request.formData();
    const file = form.get('reference');
    return Response.json(await updateImageGenStyle(access.uid, String(form.get('version')), String(form.get('style')) as AproposImageStyle,
      String(form.get('instruction') ?? ''), file instanceof File && file.size ? file : undefined), { headers });
  } catch { return Response.json({ error: 'Stilregler blev ikke gemt. Kontrollér billedfilen eller genindlæs den aktuelle version.' }, { status: 409, headers }); }
}
