import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);

function isUsableFfmpegPath(candidate: string): boolean {
  if (!candidate || candidate === 'ffmpeg') return false;
  if (candidate.includes('.next/') || candidate.includes('vendor-chunks')) return false;
  return existsSync(candidate);
}

function resolveFfmpegBinary(): string {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && isUsableFfmpegPath(fromEnv)) return fromEnv;

  // Next.js webpack kan ødelægge default-import — brug require + cwd-fallback
  const candidates: string[] = [];
  try {
    const pkgPath = require('ffmpeg-static') as string | null;
    if (pkgPath) candidates.push(pkgPath);
  } catch {
    /* ignore */
  }

  const roots = [
    process.cwd(),
    typeof __dirname === 'string' ? join(__dirname, '..', '..') : '',
    typeof __dirname === 'string' ? join(__dirname, '..', '..', '..') : '',
  ].filter(Boolean);

  for (const root of roots) {
    candidates.push(join(root, 'node_modules/ffmpeg-static/ffmpeg'));
  }

  for (const candidate of candidates) {
    if (isUsableFfmpegPath(candidate)) return candidate;
  }

  const onPath = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  const found = onPath.stdout?.trim();
  if (found && existsSync(found)) return found;

  return 'ffmpeg';
}

export async function encodeToAac96k(inputBuffer: Buffer): Promise<Buffer> {
  const ffmpegBin = resolveFfmpegBinary();
  const dir = await mkdtemp(join(tmpdir(), 'podcast-'));
  const inputPath = join(dir, 'input');
  const outputPath = join(dir, 'output.m4a');

  try {
    await writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        ffmpegBin,
        ['-y', '-i', inputPath, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outputPath],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
      });
      proc.on('error', (err) => {
        reject(
          new Error(
            `ffmpeg kunne ikke startes (${ffmpegBin}): ${err instanceof Error ? err.message : String(err)}`
          )
        );
      });
    });

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
