import { NextResponse } from 'next/server';
import { getWebflowAuthors } from '@/lib/webflow-service';

export async function GET() {
  try {
    const authors = await getWebflowAuthors();
    return NextResponse.json({ authors });
  } catch (error) {
    console.error('Error fetching Webflow authors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch authors' },
      { status: 500 }
    );
  }
}
