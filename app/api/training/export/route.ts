import { NextResponse } from 'next/server';
import { getTrainingSamples } from '@/lib/firebase-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const samples = await getTrainingSamples(1000);
    // Convert to JSONL text
    const lines = samples.map((s) => JSON.stringify({
      messages: s.messages?.map(m=>({ role: m.role, content: m.content })),
      articleData: s.articleData,
      authorName: s.authorName,
      authorTOV: s.authorTOV,
      notes: s.notes,
      published: s.published
    }));
    const body = lines.join('\n');
    return new Response(body, {
      headers: {
        'Content-Type': 'application/jsonl; charset=utf-8',
        'Content-Disposition': 'attachment; filename="apropos-training.jsonl"'
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to export training data' }, { status: 500 });
  }
}


