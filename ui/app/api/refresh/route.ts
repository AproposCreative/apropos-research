import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import path from 'node:path';

export async function POST() {
  const root = path.resolve(process.cwd(), '..'); // project root (one up from /ui)
  const cmd = 'npm run ingest:rage -- --since=48 --limit=60';
  const startedAt = Date.now();

  const out = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    exec(cmd, { cwd: root, env: process.env, timeout: 1000 * 60 * 5 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err as any).code ?? 1 : 0, stdout, stderr });
    });
  });

  return NextResponse.json({
    ok: out.code === 0,
    took_ms: Date.now() - startedAt,
    code: out.code,
    stdout: out.stdout.slice(-2000),
    stderr: out.stderr.slice(-2000),
  }, { status: out.code === 0 ? 200 : 500 });
}
