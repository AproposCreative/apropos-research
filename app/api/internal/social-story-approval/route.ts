import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { editorialRole } from '@/lib/auth-policy';
import { readEditorialAccessEntry } from '@/lib/editorial-access';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const secret = process.env.SOCIAL_STORY_BROWSER_SECRET, value = request.headers.get('x-story-service-secret');
  if (!secret || !value || Buffer.byteLength(secret) !== Buffer.byteLength(value) || !timingSafeEqual(Buffer.from(secret), Buffer.from(value)))
    return NextResponse.json({ approved: false }, { status: 401 });
  try {
    const input = await request.json();
    if (!/^[a-f0-9]{64}$/.test(input.operationId || '')) throw Error();
    const row = (await getAdminDb()!.collection('socialPublishOperations').doc(input.operationId).get()).data();
    const created = Date.parse(row?.createdAt);
    if (!row || row.delivery !== 'business-suite' || !row.approved?.isStory || row.channels.facebook || row.complete || row.phase !== 'story_preparing' ||
      !Number.isFinite(created) || Date.now()-created > 30*60_000 || created > Date.now()+60_000) throw Error();
    const user = await getAdminAuth()!.getUser(row.ownerUid);
    if (Date.parse(user.tokensValidAfterTime || '') > created) throw Error();
    const entry = await readEditorialAccessEntry(user.email?.trim().toLowerCase() || '');
    if (!editorialRole({ email: user.email, emailVerified: user.emailVerified, disabled: user.disabled, entry })) throw Error();
    return NextResponse.json({ approved: true, imageSha256: row.imageSha256, articleUrl: row.approved.articleUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ approved: false }, { status: 403 }); }
}
