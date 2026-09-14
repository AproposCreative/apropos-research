import { imageGenRequestAccess } from '@/lib/image-gen/access';
import { readImageGenBudget } from '@/lib/image-gen/budget';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await imageGenRequestAccess(request)) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  try { return Response.json(await readImageGenBudget(), { headers }); }
  catch { return Response.json({ error: 'Billedbudgettet kunne ikke hentes.' }, { status: 503, headers }); }
}
