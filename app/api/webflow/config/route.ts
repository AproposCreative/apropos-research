import { NextRequest, NextResponse } from 'next/server';
import { getWebflowConfig, saveWebflowConfig } from '@/lib/webflow-config';

export async function GET() {
  return NextResponse.json(getWebflowConfig());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cfg = saveWebflowConfig({
      apiToken: body.apiToken,
      siteId: body.siteId,
      authorsCollectionId: body.authorsCollectionId,
      articlesCollectionId: body.articlesCollectionId,
    });
    return NextResponse.json(cfg);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}


