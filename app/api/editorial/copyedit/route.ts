import { NextRequest, NextResponse } from 'next/server';
import { verifyEditorialToken } from '@/lib/editorial-access';
import { previewWorkspaceCopyedit, applyWorkspaceCopyedit } from '@/lib/editorial/workspace-copyedit';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { PRIVATE_HEADERS } from '@/lib/mcp/config';

export const runtime = 'nodejs';
async function handle(req: NextRequest, apply: boolean) {
  const bearer = req.headers.get('authorization') || '';
  const user = bearer.startsWith('Bearer ') ? await verifyEditorialToken(bearer.slice(7)) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS });
  if (!user.owner) return NextResponse.json({ error: 'owner_pilot_only' }, { status: 403, headers: PRIVATE_HEADERS });
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 250000) return NextResponse.json({ error: 'request_too_large' }, { status: 413, headers: PRIVATE_HEADERS });
    const result = await withoutPaidAi(() => (apply ? applyWorkspaceCopyedit : previewWorkspaceCopyedit)(user.uid, JSON.parse(raw)));
    return NextResponse.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) {
    const code = error instanceof Error && /^mcp_[a-z_]+$/.test(error.message) ? error.message : 'invalid_copyedit';
    return NextResponse.json({ error: code, publicationApproval: false }, { status: 409, headers: PRIVATE_HEADERS });
  }
}
export const POST = (req: NextRequest) => handle(req, false);
export const PUT = (req: NextRequest) => handle(req, true);
