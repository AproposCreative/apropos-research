import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import path from 'node:path';
import { invalidatePromptsCache } from '../../../lib/readPrompts';

export async function POST(request: Request) {
  // Parse request body to get custom parameters
  let sinceHours = 168; // Default: 1 week
  let limit = 200; // Default: 200 articles
  
  try {
    const body = await request.json();
    if (body.sinceMinutes) {
      // Convert minutes to hours (use decimal for precision)
      sinceHours = body.sinceMinutes / 60;
    } else if (body.sinceHours) {
      sinceHours = body.sinceHours;
    }
    if (body.limit) {
      limit = body.limit;
    }
  } catch {
    // If no body or parsing fails, use defaults
  }
  
  const root = process.cwd(); // We're already in the project root
  
  // Try to use direct import first (if tsx works), otherwise fall back to exec
  let useDirectImport = false;
  try {
    // Check if we can import the ingestion module directly
    // This avoids exec() and esbuild issues
    const { ingestOnce } = await import('../../../src/cli/ingest-rage');
    useDirectImport = true;
    
    // Run ingestion in background (don't await)
    ingestOnce({ sinceHrs: sinceHours, limit }).then(() => {
      invalidatePromptsCache();
      console.log('✅ Ingest completed successfully');
    }).catch((err) => {
      console.error('❌ Ingest failed:', err);
    });
    
    return NextResponse.json({
      ok: true,
      message: 'Ingest started in background (direct import)',
      sinceHours,
      limit
    }, { status: 202 });
  } catch (importErr) {
    // Fall back to exec if direct import fails
    console.log('Direct import failed, using exec fallback:', importErr);
    const cmd = `npm run ingest:rage -- --since=${sinceHours} --limit=${limit}`;

    // Start ingest in background - don't wait for it to complete
    exec(cmd, { cwd: root, env: process.env, timeout: 1000 * 60 * 5 }, (err, stdout, stderr) => {
      if (!err) {
        // Invalidate cache after successful refresh
        invalidatePromptsCache();
        console.log('✅ Ingest completed successfully');
      } else {
        console.error('❌ Ingest failed:', stderr);
      }
    });

    // Return immediately
    return NextResponse.json({
      ok: true,
      message: 'Ingest started in background (exec fallback)',
      sinceHours,
      limit
    }, { status: 202 }); // 202 Accepted
  }
}
