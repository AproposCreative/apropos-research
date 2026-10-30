import { NextRequest, NextResponse } from 'next/server';
import { refreshPodcastFeed } from '@/lib/podcast/feed-refresh';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return refreshPodcastFeed();
}
