import { NextResponse } from 'next/server';
import { getWebflowStatus, discoverWebflowCollections } from '@/lib/webflow-service';

export async function GET() {
  try {
    const status = await getWebflowStatus();
    return NextResponse.json(status);
  } catch (e:any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const res = await discoverWebflowCollections();
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}


