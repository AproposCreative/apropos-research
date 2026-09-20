import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { cleanPublishedCover, publishedCoverBaseline } from '@/lib/liv/published-cover-cleanup';

export const runtime = 'nodejs';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'no-store' };
function failure(error: unknown) {
  const code = error instanceof Error && /^(cover_cleanup|image_text)_[a-z_]+$/.test(error.message) ? error.message : 'cover_cleanup_failed';
  return NextResponse.json({ error: code, publicationVerified: false }, { status: 409, headers });
}
export async function GET(req: NextRequest) {
  const denied = requireCronBearer(req); if (denied) return denied;
  try { return NextResponse.json(await publishedCoverBaseline(req.nextUrl.searchParams.get('itemId') || ''), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req); if (denied) return denied;
  try {
    const reader = req.body?.getReader(); if (!reader) throw new Error('cover_cleanup_invalid');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 3_000_000) { await reader.cancel(); throw new Error('cover_cleanup_invalid'); }
      chunks.push(value);
    }
    return NextResponse.json(await cleanPublishedCover(JSON.parse(Buffer.concat(chunks).toString('utf8'))), { headers });
  } catch (error) { return failure(error); }
}
