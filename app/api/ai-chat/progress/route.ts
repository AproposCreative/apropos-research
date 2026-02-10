import { NextRequest, NextResponse } from 'next/server';
import { getProgress } from '@/lib/ai-chat-progress-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/ai-chat/progress?id=xxx
 * Returns current progress steps for a running AI chat request (for polling).
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }
  const state = getProgress(id);
  if (!state) {
    return NextResponse.json({ steps: [], completed: false });
  }
  return NextResponse.json({
    steps: state.steps,
    completed: state.completed ?? false,
    updatedAt: state.updatedAt,
  });
}
