import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase Admin not configured.' },
        { status: 503 }
      );
    }

    const snapshot = await db
      .collection('trainingSamples')
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();

    const lines = snapshot.docs.map((doc) => {
      const s = doc.data();
      return JSON.stringify({
        messages: s.messages?.map((m: any) => ({ role: m.role, content: m.content })),
        articleData: s.articleData,
        authorName: s.authorName,
        authorTOV: s.authorTOV,
        notes: s.notes,
        published: s.published,
      });
    });

    const body = lines.join('\n');
    return new Response(body, {
      headers: {
        'Content-Type': 'application/jsonl; charset=utf-8',
        'Content-Disposition': 'attachment; filename="apropos-training.jsonl"',
      },
    });
  } catch (e: any) {
    console.error('[training/export] Failed:', e);
    return NextResponse.json({ error: e?.message || 'Failed to export training data' }, { status: 500 });
  }
}
