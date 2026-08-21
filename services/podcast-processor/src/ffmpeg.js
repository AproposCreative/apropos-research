import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export async function encodeToAac96k(inputBuffer) {
  const dir = await mkdtemp(join(tmpdir(), 'podcast-'));
  const inputPath = join(dir, 'input');
  const outputPath = join(dir, 'output.m4a');

  try {
    await writeFile(inputPath, inputBuffer);

    await new Promise((resolve, reject) => {
      const proc = spawn(
        'ffmpeg',
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
      proc.on('error', reject);
    });

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Probe duration in whole seconds. Returns null if probe fails. */
export async function probeDurationSeconds(inputBuffer) {
  const dir = await mkdtemp(join(tmpdir(), 'podcast-probe-'));
  const inputPath = join(dir, 'input');
  try {
    await writeFile(inputPath, inputBuffer);
    const stderr = await new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', ['-i', inputPath, '-f', 'null', '-'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let err = '';
      proc.stderr.on('data', (d) => {
        err += d.toString();
      });
      proc.on('close', () => resolve(err));
      proc.on('error', reject);
    });
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
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
