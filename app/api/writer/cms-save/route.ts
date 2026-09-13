import { NextResponse } from 'next/server';
import { z } from 'zod';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';
import { saveWriterCmsDraft, WriterCmsPending } from '@/lib/articles/writer-cms-save';
import type { ArticlePayload } from '@/lib/articles/article-payload';

export const runtime = 'nodejs';
export const maxDuration = 300;
const schema = z.object({ draftId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/), article: z.object({
  title: z.string().trim().min(1).max(500), content: z.string().trim().min(1),
  webflowId: z.union([z.literal(''), z.string().regex(/^[a-f0-9]{24}$/i)]).optional(),
}).passthrough() }).strict();
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return reply({ error: 'Log ind for at gemme din kladde.' }, 401);
  const text = await request.text();
  if (Buffer.byteLength(text) > 500_000) return reply({ error: 'Kladden er for stor.' }, 413);
  const parsed = schema.safeParse((() => { try { return JSON.parse(text); } catch { return null; } })());
  if (!parsed.success) return reply({ error: 'Ugyldig kladde.' }, 400);
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const saved = await saveWriterCmsDraft(db, access.uid, parsed.data.draftId, parsed.data.article as unknown as ArticlePayload);
    return reply({ data: saved });
  } catch (error) {
    return reply({ error: error instanceof WriterCmsPending ? error.message : 'CMS-gemningen kunne ikke kontrolleres. Prøv samme kladde igen.',
      ...(error instanceof WriterCmsPending && error.articleId ? { articleId: error.articleId } : {}),
      saveState: 'unverified', publicationVerified: false }, 503);
  }
}
