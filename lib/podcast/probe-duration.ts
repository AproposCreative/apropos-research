import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, writeFile, rm } from 'fs/promises';
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

  return 'ffmpeg';
}

/** Probe duration in whole seconds (rounded). Returns null if probe fails. */
export async function probeAudioDurationSeconds(inputBuffer: Buffer): Promise<number | null> {
  const ffmpegBin = resolveFfmpegBinary();
  const dir = await mkdtemp(join(tmpdir(), 'podcast-probe-'));
  const inputPath = join(dir, 'input');

  try {
    await writeFile(inputPath, inputBuffer);

    const stdout = await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        ffmpegBin,
        ['-i', inputPath, '-f', 'null', '-'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', () => resolve(stderr));
      proc.on('error', (err) => reject(err));
    });

    const match = stdout.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
    return Math.max(0, Math.round(hours * 3600 + minutes * 60 + seconds));
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Format seconds as H:MM:SS or M:SS for itunes:duration. */
export function formatItunesDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
