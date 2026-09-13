import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { EDITORIAL_ACCESS_COLLECTION, verifyEditorialToken } from '@/lib/editorial-access';
import { normalizeAccessEmail } from '@/lib/auth-policy';

export const runtime = 'nodejs';
async function administrator(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const access = header.startsWith('Bearer ') ? await verifyEditorialToken(header.slice(7)) : null;
  return access?.role === 'admin' ? access : null;
}
const forbidden = () => NextResponse.json({ error: 'Administratoradgang kræves' }, { status: 403 });

export async function GET(request: NextRequest) {
  if (!(await administrator(request))) return forbidden();
  const rows = await getAdminDb()!.collection(EDITORIAL_ACCESS_COLLECTION).get();
  return NextResponse.json({ entries: rows.docs.map(doc => ({ email: doc.id, ...doc.data() })) },
    { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  const admin = await administrator(request);
  if (!admin) return forbidden();
  const input = await request.json().catch(() => null);
  const email = normalizeAccessEmail(input?.email);
  if (!email || typeof input.active !== 'boolean' || !['editor', 'admin'].includes(input.role)) {
    return NextResponse.json({ error: 'Ugyldig mail, status eller rolle' }, { status: 400 });
  }
  const db = getAdminDb()!;
  const entry = { active: input.active, role: input.role, updatedBy: admin.uid, updatedAt: new Date().toISOString() };
  const batch = db.batch();
  batch.set(db.collection(EDITORIAL_ACCESS_COLLECTION).doc(email), entry);
  batch.set(db.collection('editorialAccessAudit').doc(), { email, ...entry });
  await batch.commit();
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
