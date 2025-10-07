import { NextResponse } from 'next/server';
import { getArticleFields } from '@/lib/webflow-service';

export async function GET() {
  try {
    const fields = await getArticleFields();
    return NextResponse.json({ fields });
  } catch (error) {
    console.error('Error fetching Webflow article fields:', error);
    return NextResponse.json(
      { error: 'Failed to fetch article fields' },
      { status: 500 }
    );
  }
}
