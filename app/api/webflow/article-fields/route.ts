import { NextResponse } from 'next/server';
import { getArticlesCollectionFieldsDetailed } from '@/lib/webflow-service';

export async function GET() {
  try {
    const fields = await getArticlesCollectionFieldsDetailed();
    return NextResponse.json({ fields });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch fields' }, { status: 500 });
  }
}


