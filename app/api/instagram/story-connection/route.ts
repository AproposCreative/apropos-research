import { NextResponse } from 'next/server';
import { z } from 'zod';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { storyBrowserConfigured, storyBrowserRequest } from '@/lib/social/story-browser';
export const runtime = 'nodejs';
export const maxDuration = 120;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
const input = z.object({ action: z.enum(['begin', 'refresh', 'click', 'text', 'key', 'instagram', 'finish', 'cancel']),
  setupId: z.string().uuid().optional(), x: z.number().min(0).max(1650).optional(), y: z.number().min(0).max(1045).optional(),
  text: z.string().max(2000).optional(), key: z.enum(['Enter', 'Tab', 'Shift+Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']).optional(),
}).strict().refine(x => ['begin', 'cancel'].includes(x.action) || !!x.setupId)
  .refine(x => x.action !== 'click' || (x.x !== undefined && x.y !== undefined))
  .refine(x => x.action !== 'text' || typeof x.text === 'string').refine(x => x.action !== 'key' || !!x.key);
export async function GET(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access?.owner) return json({ error: 'Kun ejeren kan tilslutte Story-forbindelsen.' }, access ? 403 : 401);
  if (!storyBrowserConfigured()) return json({ configured: false, connected: false });
  try {
    const response = await storyBrowserRequest('/status');
    if (!response.ok) throw Error();
    const status = await response.json();
    return json({ configured: true, connected: status.connected === true, connectedAt: status.connectedAt ?? null });
  } catch { return json({ error: 'Serverforbindelsen kunne ikke bekræftes.' }, 503); }
}
export async function POST(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access?.owner) return json({ error: 'Kun ejeren kan tilslutte Story-forbindelsen.' }, access ? 403 : 401);
  const raw = await request.text(); if (raw.length > 12_000) return json({ error: 'Ugyldigt input.' }, 400);
  const parsed = input.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!parsed.success) return json({ error: 'Ugyldigt input.' }, 400);
  try {
    const response = await storyBrowserRequest('/setup', { method: 'POST', body: JSON.stringify({ ...parsed.data, ownerUid: access.uid }) });
    if (!response.ok) throw Error();
    const data = await response.json();
    // Deliberately bounded response: no cookies, tokens, raw DOM or arbitrary URL.
    return json({ connected: data.connected === true, setupId: data.setupId, screenshot: data.screenshot,
      width: data.width, height: data.height, expiresAt: data.expiresAt, ...(data.cancelled === true ? { cancelled: true } : {}) });
  } catch { return json({ error: 'Forbindelsen kunne ikke bekræftes. Opdatér billedet før næste handling.' }, 503); }
}
