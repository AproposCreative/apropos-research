import { NextResponse } from 'next/server';
import { invalidatePromptsCache } from '../../../lib/readPrompts';

export async function POST(request: Request) {
  try {
    // Invalidate the cache
    invalidatePromptsCache();
    
    return NextResponse.json({
      ok: true,
      message: 'Cache invalidated successfully',
      timestamp: new Date().toISOString()
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: 'Failed to invalidate cache',
      message: error?.message || String(error)
    }, { status: 500 });
  }
}
