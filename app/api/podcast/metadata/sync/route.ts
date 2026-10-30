import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { refreshPodcastFeed } from '@/lib/podcast/feed-refresh';

export const runtime = 'nodejs';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return NextResponse.json({ error: 'Log ind som ejer.' }, { status: 401, headers });
  if (!access.owner) return NextResponse.json({ error: 'Kun ejeren kan opdatere podcastmetadata.' }, { status: 403, headers });
  return refreshPodcastFeed();
}
