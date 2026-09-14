import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER_SHA256 = '9801ce3aa35e45f72f7d13339ff04c916011b529040d1a1301c74102ed335fb9';

// npm lifecycle scripts remain disabled. Only this reviewed installer is allowed.
export function prepareFfmpeg({ root = ROOT, run = spawnSync } = {}) {
  const directory = path.join(root, 'node_modules', 'ffmpeg-static');
  const installer = path.join(directory, 'install.js');
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (pkg.version !== '5.3.0' || pkg['ffmpeg-static']?.['binary-release-tag'] !== 'b6.1.1' ||
      createHash('sha256').update(fs.readFileSync(installer)).digest('hex') !== INSTALLER_SHA256) {
    throw new Error('FFmpeg installer changed: review before allowing installation');
  }
  const binary = path.join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const env = { ...process.env, CI: '1' };
  // Build for the actual deployment platform, from the package's reviewed source.
  for (const name of ['FFMPEG_BIN', 'FFMPEG_BINARY_RELEASE', 'FFMPEG_BINARIES_URL',
    'npm_config_platform', 'npm_config_arch']) delete env[name];
  if (!fs.existsSync(binary)) {
    const installed = run(process.execPath, [installer], {
      cwd: directory, env, timeout: 180_000, stdio: 'pipe', maxBuffer: 1024 * 1024,
    });
    if (installed.error || installed.status !== 0) {
      // Do not print installer output, URLs or the inherited environment.
      const reason = installed.error?.code === 'ETIMEDOUT' ? 'timeout' : `exit ${installed.status ?? 'unknown'}`;
      throw new Error(`FFmpeg installation failed (${reason})`);
    }
  }
  const verified = run(binary, ['-version'], {
    env, timeout: 10_000, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1024 * 1024,
  });
  if (verified.error || verified.status !== 0 || !String(verified.stdout).startsWith('ffmpeg version ')) {
    throw new Error('FFmpeg executable verification failed');
  }
  return binary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    prepareFfmpeg();
    console.log('Reviewed FFmpeg installation and executable check passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
