/**
 * Admin endpoint — sætter dagens (eller en given dayKey's) auto-publicerede
 * Liv-artikel til DRAFT + ARCHIVED i Webflow så den forsvinder fra siden.
 *
 * Beskyttet med samme `CRON_SECRET` Bearer som cron-endpoints, så det kan
 * kaldes hurtigt fra terminal/Postman uden Firebase ID-token.
 *
 * Usage:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<host>/api/liv/unpublish-today"
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<host>/api/liv/unpublish-today?dayKey=2026-04-20"
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { logger } from '@/lib/logger';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  LIV_DAILY_COLLECTION,
  livDailyDocId,
  todayDayKeyUTC,
} from '@/lib/liv/daily-history-store';
import { env } from '@/lib/config/env';

export const maxDuration = 60;

function resolveWebflowConfig() {
  const token = env.WEBFLOW_API_TOKEN;
  const collectionId = env.WEBFLOW_ARTICLES_COLLECTION_ID;
  return { token, collectionId };
}

export async function POST(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  const sp = req.nextUrl.searchParams;
  const dayKey = sp.get('dayKey')?.trim() || todayDayKeyUTC();

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: 'Firestore (firebase-admin) er ikke konfigureret.' },
      { status: 503 }
    );
  }

  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey));
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, reason: 'no_record', dayKey }, { status: 404 });
  }
  const data = snap.data() || {};
  if (data.status !== 'published') {
    return NextResponse.json({
      ok: false,
      reason: 'not_published',
      dayKey,
      status: data.status,
    });
  }
  const itemId = typeof data.webflowItemId === 'string' ? data.webflowItemId : null;
  if (!itemId) {
    return NextResponse.json({
      ok: false,
      reason: 'missing_webflowItemId',
      dayKey,
    }, { status: 422 });
  }

  const { token, collectionId } = resolveWebflowConfig();
  if (!token || !collectionId) {
    return NextResponse.json(
      { error: 'WEBFLOW_API_TOKEN eller WEBFLOW_ARTICLES_COLLECTION_ID mangler.' },
      { status: 503 }
    );
  }

  // 1) PATCH item: sæt isDraft + isArchived så den ikke vises på sitet
  const patchUrl = `https://api.webflow.com/v2/collections/${collectionId}/items/${encodeURIComponent(itemId)}`;
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Version': '1.0.0',
    },
    body: JSON.stringify({ isDraft: true, isArchived: true }),
  });

  let patchBody: unknown = null;
  try {
    patchBody = await patchRes.json();
  } catch {
    /* ignore */
  }

  if (!patchRes.ok) {
    logger.error(
      '[liv/unpublish-today] Webflow PATCH failed',
      new Error(`status=${patchRes.status}`),
      { dayKey, itemId, body: patchBody }
    );
    return NextResponse.json(
      { ok: false, reason: 'webflow_patch_failed', status: patchRes.status, body: patchBody },
      { status: 502 }
    );
  }

  // 2) Markér i Firestore at vi har trukket artiklen tilbage så `claim`
  // ikke prøver at re-publishe samme dag.
  await ref.set(
    {
      status: 'skipped_moderation',
      reason: `Manuelt unpublished via /api/liv/unpublish-today (var publiceret som ${itemId}).`,
      updatedAt: new Date(),
    },
    { merge: true }
  );

  logger.warn('[liv/unpublish-today] article reverted to draft', {
    dayKey,
    itemId,
    title: data.title,
  });

  return NextResponse.json({
    ok: true,
    dayKey,
    webflowItemId: itemId,
    title: data.title || null,
    note: 'Artiklen er sat til draft + archived i Webflow. Publish sitet for at fjerne den fra live.',
  });
}
