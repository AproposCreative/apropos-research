import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { claimSeoTasks, getSeoTask, saveSeoReview, applySeoReview, activateChatSeo } from '@/lib/seo-engine/post-publish/chat';
import { seoProcessorMode } from '@/lib/seo-engine/post-publish/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  const access = await editorialRequestAccess(request);
  if (!access?.owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  try {
    const taskId = request.nextUrl.searchParams.get('taskId');
    return NextResponse.json(taskId ? await getSeoTask(access.uid, taskId) : { processor: await seoProcessorMode() }, { headers });
  } catch (e) { return failure(e); }
}
const command = z.object({ action: z.enum(['claim', 'save', 'apply', 'activate']), input: z.unknown() }).strict();
export async function POST(request: NextRequest) {
  const access = await editorialRequestAccess(request);
  if (!access?.owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  try {
    const text = await request.text();
    if (text.length > 20_000) throw Error('seo_chat_input_too_large');
    const { action, input } = command.parse(JSON.parse(text));
    const operations = { claim: claimSeoTasks, save: saveSeoReview, apply: applySeoReview, activate: activateChatSeo };
    return NextResponse.json(await operations[action](access.uid, input), { headers });
  } catch (e) { return failure(e); }
}
function failure(e: unknown) {
  const error = e instanceof Error && /^seo_[a-z_0-9]+$/.test(e.message) ? e.message : 'seo_chat_invalid_or_unconfirmed';
  return NextResponse.json({ error, paidModelCalls: 0, action: 'Read saved task before retrying.' }, { status: 409, headers });
}
