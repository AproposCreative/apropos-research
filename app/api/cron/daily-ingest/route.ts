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
  // Hourly ingest: last 2 hours, limit 50 articles (more frequent, smaller batches)
  const sinceHours = 2;
  const limit = 50;
  const cmd = `npm run ingest:rage -- --since=${sinceHours} --limit=${limit}`;

  console.log(`🔄 Starting hourly article ingestion via Vercel cron (since=${sinceHours}h, limit=${limit})...`);

  // Use promisified exec for better error handling
  return new Promise<NextResponse>((resolve) => {
    exec(cmd, { cwd: root, env: process.env, timeout: 1000 * 60 * 5 }, async (err, stdout, stderr) => {
      if (!err) {
        invalidatePromptsCache();
        console.log('✅ Hourly ingest completed successfully');
        if (stdout) {
          console.log(stdout);
          // Extract metrics from output if available
          try {
            const metricsMatch = stdout.match(/newArticles[:\s]+(\d+)/i);
            const newCount = metricsMatch ? parseInt(metricsMatch[1]) : 0;
            console.log(`📊 New articles ingested: ${newCount}`);
          } catch {}
        }
        resolve(NextResponse.json({
          ok: true,
          message: 'Hourly ingest completed successfully',
          timestamp: new Date().toISOString(),
          sinceHours,
          limit
        }, { status: 200 }));
      } else {
        console.error('❌ Hourly ingest failed:', stderr || err);
        resolve(NextResponse.json({
          ok: false,
          error: 'Ingest failed',
          message: stderr || String(err),
          timestamp: new Date().toISOString()
        }, { status: 500 }));
      }
    });
  });
}

