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
