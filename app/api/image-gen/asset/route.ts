import { imageGenRequestAccess } from '@/lib/image-gen/access';
import { readImageGenAsset } from '@/lib/image-gen/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  const access = await imageGenRequestAccess(request);
  if (!access) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[a-f0-9]{64}$/.test(id)) return Response.json({ error: 'invalid_id' }, { status: 400, headers });
  try { const { bytes } = await readImageGenAsset(access.uid, id);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: 'Billedet kunne ikke hentes.' }, { status: 404, headers }); }
}
