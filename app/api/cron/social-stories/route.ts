import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { dispatchBrowserStory, storyBrowserConfigured } from '@/lib/social/story-browser';
export const runtime = 'nodejs';
export const maxDuration = 300;
/** A durable queued task is safe to dispatch. Preparing/sending tasks are never
 * re-executed, even after a host timeout. The worker owns the transactional lock. */
export async function GET(request: NextRequest) {
  const denial = requireCronBearer(request); if (denial) return denial;
  const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!storyBrowserConfigured()) return json({ configured: false, dispatched: 0 });
  try {
    const db = getAdminDb(); if (!db) throw Error();
    const queued = await db.collection('socialStoryBrowserTasks').where('status', '==', 'queued').limit(10).get();
    const task = queued.docs.map(row => row.data()).filter(row => row.dispatchCount === 0)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!task) return json({ dispatched: 0 });
    await dispatchBrowserStory(task.id);
    return json({ checked: 1 });
  } catch { return json({ error: 'Story-køen kunne ikke bekræftes. Ingen igangværende afsendelse gentages.' }, 503); }
}
