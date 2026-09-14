import { editorialRequestAccess } from '@/lib/editorial-access';
import { imageGenQuotes } from '@/lib/image-gen/quotes';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!await editorialRequestAccess(request)) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  try { return Response.json({ quotes: await imageGenQuotes() }, { headers }); }
  catch { return Response.json({ error: 'Billedbudgettet er ikke tilgængeligt.' }, { status: 503, headers }); }
}
