import { NextRequest, NextResponse } from 'next/server';
import { saveTrainingSample } from '@/lib/firebase-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, authorName, authorTOV, articleData, messages, notes, published } = body || {};
    if (!userId || !messages || !articleData) {
      return NextResponse.json({ error: 'userId, messages, articleData required' }, { status: 400 });
    }
    const id = await saveTrainingSample(userId, { authorName, authorTOV, articleData, messages, notes, published });
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 });
  }
}


