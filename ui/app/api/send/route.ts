import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // Expect: { items: Array<{ title, url, summary, bullets[] }> }
  const body = await req.json().catch(() => ({}));
  // In real life: forward to Make/Zapier/your AI endpoint here.
  return NextResponse.json({ ok: true, received: Array.isArray(body?.items) ? body.items.length : 0 });
}
