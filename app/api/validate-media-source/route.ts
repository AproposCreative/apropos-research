import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { checkMediaSource } from '@/lib/media-source-check-cache';
import { createSuccessResponse } from '@/lib/api/types';
export const runtime = 'nodejs';
export const maxDuration = 30;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return reply({ error: 'Log ind for at kontrollere en kilde.' }, 401);
  let body;
  try { const raw = await req.text(); if (raw.length > 5000) return reply({ error: 'Ugyldig kilde.' }, 400); body = JSON.parse(raw); }
  catch { return reply({ error: 'Ugyldig kilde.' }, 400); }
  if (typeof body?.baseUrl !== 'string' || typeof body?.sitemapIndex !== 'string') return reply({ error: 'Angiv kilde og feed/sitemap.' }, 400);
  try { return reply(createSuccessResponse(await checkMediaSource(access.uid, body.baseUrl, body.sitemapIndex, body.refresh === true))); }
  catch { return reply({ error: 'Kilden kunne ikke valideres som et offentligt HTTPS-feed eller sitemap inden for grænserne.' }, 422); }
}
