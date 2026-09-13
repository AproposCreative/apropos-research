import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { checkMediaSource } from '@/lib/media-source-check-cache';

interface MediaSourceDoc {
  id: string;
  userId: string;
  name: string;
  baseUrl: string;
  sitemapIndex: string;
  enabled: boolean;
  createdAt: string;
}

async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  return getNewsletterUserIdFromRequest(req);
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  const userId = await getUserIdFromRequest(request);

  const db = getAdminDb();
  if (!userId) return NextResponse.json({ error: 'Log ind for at se dine mediekilder.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  if (!db) return NextResponse.json({ error: 'Mediekilder kunne ikke hentes.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });

  try {
    const snap = await db.collection('mediaSources').where('userId', '==', userId).get();

    const sources = snap.docs.map(d => d.data() as MediaSourceDoc);
    sources.sort((a, b) => a.name.localeCompare(b.name));
    requestLogger.info('Media sources loaded', { userId, count: sources.length });
    return NextResponse.json(createSuccessResponse({ sources }, { requestId }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    requestLogger.error('Error loading media sources', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: 'Mediekilder kunne ikke hentes. Dine gemte kilder er ikke ændret.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  const userId = await getUserIdFromRequest(req);

  if (!userId) {
    return NextResponse.json(createErrorResponse('userId er påkrævet', { statusCode: 401, errorCode: ErrorCode.AUTHENTICATION, requestId }), { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(createErrorResponse('Database ikke tilgængelig', { statusCode: 503, errorCode: ErrorCode.INTERNAL_ERROR, requestId }), { status: 503 });
  }

  try {
    const body = await req.json();
    const { name, baseUrl, sitemapIndex } = body;

    if (!name || !baseUrl || !sitemapIndex) {
      return NextResponse.json({ error: 'Name, baseUrl, and sitemapIndex are required' }, { status: 400 });
    }

    try { new URL(baseUrl); new URL(sitemapIndex, baseUrl); } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const id = `${userId}_${name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}`;

    const existing = await db.collection('mediaSources').doc(id).get();
    if (existing.exists) {
      return NextResponse.json({ error: 'Media source with this name already exists' }, { status: 409 });
    }

    try {
      await checkMediaSource(userId, baseUrl, sitemapIndex);
    } catch {
      return NextResponse.json({ error: 'Cannot access sitemap URL' }, { status: 400 });
    }

    const newSource: MediaSourceDoc = { id, userId, name, baseUrl, sitemapIndex, enabled: true, createdAt: new Date().toISOString() };
    await db.collection('mediaSources').doc(id).set(newSource);

    requestLogger.info('Media source added', { id, name, userId });
    return NextResponse.json(createSuccessResponse({ source: newSource, message: `${name} er blevet tilføjet som mediekilde` }, { requestId }));
  } catch (error) {
    requestLogger.error('Error adding media source', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(createErrorResponse('Internal server error', { statusCode: 500, errorCode: ErrorCode.INTERNAL_ERROR, requestId }), { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  const userId = await getUserIdFromRequest(req);

  if (!userId) {
    return NextResponse.json(createErrorResponse('userId er påkrævet', { statusCode: 401, errorCode: ErrorCode.AUTHENTICATION, requestId }), { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(createErrorResponse('Database ikke tilgængelig', { statusCode: 503, errorCode: ErrorCode.INTERNAL_ERROR, requestId }), { status: 503 });
  }

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Media source ID is required' }, { status: 400 });

    const body = await req.json();
    const { name, baseUrl, sitemapIndex } = body;
    if (!name || !baseUrl || !sitemapIndex) return NextResponse.json({ error: 'Name, baseUrl, and sitemapIndex are required' }, { status: 400 });

    try { new URL(baseUrl); new URL(sitemapIndex, baseUrl); } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const docRef = db.collection('mediaSources').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return NextResponse.json({ error: 'Media source not found' }, { status: 404 });

    const existing = docSnap.data() as MediaSourceDoc;
    if (existing.userId !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    try {
      await checkMediaSource(userId, baseUrl, sitemapIndex);
    } catch {
      return NextResponse.json({ error: 'Cannot access sitemap URL' }, { status: 400 });
    }

    await docRef.update({ name, baseUrl, sitemapIndex });

    const updatedSource = { ...existing, name, baseUrl, sitemapIndex };
    requestLogger.info('Media source updated', { id, name, userId });
    return NextResponse.json(createSuccessResponse({ source: updatedSource, message: `${name} er blevet opdateret` }, { requestId }));
  } catch (error) {
    requestLogger.error('Error updating media source', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(createErrorResponse('Internal server error', { statusCode: 500, errorCode: ErrorCode.INTERNAL_ERROR, requestId }), { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  const userId = await getUserIdFromRequest(req);

  if (!userId) {
    return NextResponse.json(createErrorResponse('userId er påkrævet', { statusCode: 401, errorCode: ErrorCode.AUTHENTICATION, requestId }), { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(createErrorResponse('Database ikke tilgængelig', { statusCode: 503, errorCode: ErrorCode.INTERNAL_ERROR, requestId }), { status: 503 });
  }

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Media source ID is required' }, { status: 400 });

    const docRef = db.collection('mediaSources').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return NextResponse.json({ error: 'Media source not found' }, { status: 404 });

    const existing = docSnap.data() as MediaSourceDoc;
    if (existing.userId !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await docRef.delete();
    requestLogger.info('Media source removed', { id, name: existing.name, userId });
    return NextResponse.json(createSuccessResponse({ message: `${existing.name} er blevet fjernet`, source: existing }, { requestId }));
  } catch (error) {
    requestLogger.error('Error removing media source', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(createErrorResponse('Internal server error', { statusCode: 500, errorCode: ErrorCode.INTERNAL_ERROR, requestId }), { status: 500 });
  }
}
