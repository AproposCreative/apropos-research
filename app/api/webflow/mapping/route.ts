import { NextResponse } from 'next/server';
import { readMapping, saveMapping, type WebflowMapping } from '@/lib/webflow-mapping';

export async function GET() {
  const mapping = readMapping();
  return NextResponse.json(mapping);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as WebflowMapping;
    if (!body || !Array.isArray(body.entries)) {
      return NextResponse.json({ error: 'Invalid mapping' }, { status: 400 });
    }
    saveMapping(body);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 });
  }
}


