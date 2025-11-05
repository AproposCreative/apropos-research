import { NextResponse } from 'next/server';
import { ingestOnce } from '../../../src/cli/ingest-rage';

export async function GET() {
  try {
    console.log('🧪 Test ingestion started...');
    
    // Run a small test ingestion (last 24 hours, limit 10)
    const result = await ingestOnce({ sinceHrs: 24, limit: 10 });
    
    return NextResponse.json({
      success: true,
      result,
      message: 'Test ingestion completed'
    });
  } catch (error: any) {
    console.error('❌ Test ingestion failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

