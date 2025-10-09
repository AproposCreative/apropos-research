import { NextResponse } from 'next/server';
import { discoverWebflowCollections } from '@/lib/webflow-service';

export async function POST() {
  try {
    const res = await discoverWebflowCollections();
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}


