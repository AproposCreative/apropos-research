import { NextRequest, NextResponse } from 'next/server';
import { WebflowAuthors } from '@/lib/webflow-authors';

export async function GET(request: NextRequest) {
  try {
    const webflowAuthors = new WebflowAuthors();
    const result = await webflowAuthors.getAuthors();

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to fetch authors' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      authors: result.authors
    });

  } catch (error) {
    console.error('Get authors error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch authors' }, 
      { status: 500 }
    );
  }
}
