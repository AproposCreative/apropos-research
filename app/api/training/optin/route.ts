import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, authorName, authorTOV, articleData, messages, notes, published } = body || {};
    if (!userId || !messages || !articleData) {
      return NextResponse.json({ error: 'userId, messages, articleData required' }, { status: 400 });
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase Admin not configured. Set FIREBASE_ADMIN_* env vars.' },
        { status: 503 }
      );
    }

    const docRef = db.collection('trainingSamples').doc();
    await docRef.set({
      userId,
      authorName: authorName || null,
      authorTOV: authorTOV || null,
      articleData,
      messages,
      notes: notes || null,
      published: published || false,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (e: any) {
    console.error('[training/optin] Failed:', e);
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 });
  }
}
