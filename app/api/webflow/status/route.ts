import { NextResponse } from 'next/server';
import { getWebflowStatus } from '@/lib/webflow-service';

export async function GET() {
  try {
    const status = await getWebflowStatus();
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ connected: false, error: String(err?.message || err) }, { status: 500 });
  }
}


