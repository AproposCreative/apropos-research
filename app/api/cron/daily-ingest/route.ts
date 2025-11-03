import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { invalidatePromptsCache } from '../../../../lib/readPrompts';

// Vercel cron job configuration
export const maxDuration = 300; // 5 minutes (requires Vercel Pro plan)
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Vercel automatically sends cron requests with x-vercel-signature header
  // For additional security, you can check for a CRON_SECRET env variable
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  
  // Optional: verify CRON_SECRET if set (for manual testing)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow if it's a Vercel cron request (has x-vercel-signature or in production)
    const isVercelCron = request.headers.get('x-vercel-signature') || process.env.VERCEL === '1';
    if (!isVercelCron) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  const root = process.cwd();
  // Daily ingest: last 24 hours, limit 100 articles (same as GitHub Actions workflow)
  const cmd = `npm run ingest:rage -- --since=24 --limit=100`;

  console.log('🔄 Starting daily article ingestion via Vercel cron...');

  // Start ingest in background
  exec(cmd, { cwd: root, env: process.env, timeout: 1000 * 60 * 5 }, (err, stdout, stderr) => {
    if (!err) {
      invalidatePromptsCache();
      console.log('✅ Daily ingest completed successfully');
      if (stdout) console.log(stdout);
    } else {
      console.error('❌ Daily ingest failed:', stderr);
    }
  });

  // Return immediately (non-blocking)
  return NextResponse.json({
    ok: true,
    message: 'Daily ingest started in background',
    timestamp: new Date().toISOString()
  }, { status: 202 }); // 202 Accepted
}

