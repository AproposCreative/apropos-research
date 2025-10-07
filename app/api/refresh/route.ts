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
  const cmd = `npm run ingest:rage -- --since=${sinceHours} --limit=${limit}`;
  const startedAt = Date.now();

  const out = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    exec(cmd, { cwd: root, env: process.env, timeout: 1000 * 60 * 5 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err as any).code ?? 1 : 0, stdout, stderr });
    });
  });

  // Invalidate cache after successful refresh
  if (out.code === 0) {
    invalidatePromptsCache();
  }

  return NextResponse.json({
    ok: out.code === 0,
    took_ms: Date.now() - startedAt,
    code: out.code,
    stdout: out.stdout.slice(-2000),
    stderr: out.stderr.slice(-2000),
  }, { status: out.code === 0 ? 200 : 500 });
}
