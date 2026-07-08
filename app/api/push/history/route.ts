import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const limit = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 15)));
  const snap = await db
    .collection('pushNotifications')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const items = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      title: d.title || '',
      body: d.body || '',
      destination: d.destination || 'none',
      articleSlug: d.articleSlug || null,
      topic: d.topic || '',
      imageUrl: d.imageUrl || null,
      createdAt: d.createdAt?.toDate?.()?.toISOString?.() || null,
    };
  });

  return NextResponse.json({ ok: true, items });
}
