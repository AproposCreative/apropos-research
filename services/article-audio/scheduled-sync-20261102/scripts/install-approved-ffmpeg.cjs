'use strict';
// The CLI is the single explicitly approved Cloud build exception. Importing
// this guard is inert; tests inject filesystem/process boundaries, never run it.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const PINS = require('./approved-ffmpeg-pins.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function hashFile(file, mode = 'sha256') {
  const before = fs.statSync(file);
  if (!before.isFile()) throw Error('Expected regular approved artifact');
  const hash = crypto.createHash(mode === 'git-sha1' ? 'sha1' : 'sha256');
  if (mode === 'git-sha1') hash.update(`blob ${before.size}\0`);
  const fd = fs.openSync(file, 'r'), buffer = Buffer.alloc(1024 * 1024);
  try {let n;while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, n));} finally {fs.closeSync(fd);}
  const after = fs.statSync(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw Error('Approved artifact changed during hash');
  return {size: before.size, digest: hash.digest('hex'), executable: (before.mode & 0o111) !== 0};
}
function qualify({root, io = fs, env = process.env, platform = process.platform, arch = process.arch}) {
  if (platform !== 'linux' || arch !== 'x64') throw Error('Only reviewed Cloud Linux x64 build supported');
  if (env.NPM_CONFIG_IGNORE_SCRIPTS !== 'true' || (env.npm_config_ignore_scripts !== undefined && env.npm_config_ignore_scripts !== 'true')) throw Error('All automatic npm lifecycle scripts must remain disabled');
  if (env.GOOGLE_NODE_RUN_SCRIPTS !== PINS.scriptName || env.npm_lifecycle_event !== PINS.scriptName) throw Error('Only the approved named build script may invoke this guard');
  if (env.NODE_OPTIONS || env.NODE_PATH || env.FFMPEG_BIN ||
      (env.FFMPEG_BINARY_RELEASE !== undefined && env.FFMPEG_BINARY_RELEASE !== PINS.ffmpeg.release) ||
      (env.FFMPEG_BINARIES_URL !== undefined && env.FFMPEG_BINARIES_URL !== PINS.ffmpeg.baseURL) ||
      (env.npm_config_platform !== undefined && env.npm_config_platform !== 'linux') ||
      (env.npm_config_arch !== undefined && env.npm_config_arch !== 'x64')) throw Error('Unreviewed executable/release/platform override');
  const packageBytes = io.readFileSync(path.join(root, 'package.json')), lockBytes = io.readFileSync(path.join(root, 'package-lock.json'));
  if (sha(packageBytes) !== PINS.packageSHA256 || sha(lockBytes) !== PINS.lockSHA256) throw Error('Approved package or lock bytes changed');
  const pkg = JSON.parse(packageBytes), lock = JSON.parse(lockBytes);
  if (pkg.scripts?.[PINS.scriptName] !== PINS.command || pkg.scripts?.['pre' + PINS.scriptName] || pkg.scripts?.['post' + PINS.scriptName]) throw Error('Unreviewed named build command/hooks');
  const ffmpegDir = path.join(root, 'node_modules/ffmpeg-static'), ffprobeDir = path.join(root, 'node_modules/ffprobe-static');
  for (const [moduleName, pins, directory] of [['ffmpeg-static', PINS.ffmpeg, ffmpegDir], ['ffprobe-static', PINS.ffprobe, ffprobeDir]]) {
    const item = lock.packages?.['node_modules/' + moduleName], installed = JSON.parse(io.readFileSync(path.join(directory, 'package.json')));
    if (item?.version !== pins.version || item.resolved !== pins.resolved || item.integrity !== pins.integrity || installed.name !== moduleName || installed.version !== pins.version) throw Error('Approved dependency identity changed');
  }
  for (const [name, digest] of Object.entries(PINS.ffmpeg.sourceFiles)) if (sha(io.readFileSync(path.join(ffmpegDir, name))) !== digest) throw Error('Approved ffmpeg installer source bytes changed');
  if (sha(io.readFileSync(path.join(ffprobeDir, 'package.json'))) !== PINS.ffprobe.packageSHA256) throw Error('Approved ffprobe package loader bytes changed');
  if (sha(io.readFileSync(path.join(ffprobeDir, 'index.js'))) !== PINS.ffprobe.indexSHA256) throw Error('Approved ffprobe loader bytes changed');
  return {ffmpegDir, ffprobeDir, command: process.execPath, args: [path.join(ffmpegDir, 'install.js')],
    options: {cwd: ffmpegDir, shell: false, timeout: 180000, stdio: 'inherit', env: {...env,
      NPM_CONFIG_IGNORE_SCRIPTS: 'true', npm_config_ignore_scripts: 'true', CI: 'true', npm_config_platform: 'linux', npm_config_arch: 'x64',
      FFMPEG_BINARY_RELEASE: PINS.ffmpeg.release, FFMPEG_BINARIES_URL: PINS.ffmpeg.baseURL}}};
}
function installApproved({root = path.resolve(__dirname, '..'), io = fs, env = process.env, platform = process.platform, arch = process.arch,
  spawn = spawnSync, measure = hashFile} = {}) {
  const plan = qualify({root, io, env, platform, arch});
  // Guard requires the exact installed source. No npm rebuild, npm install,
  // lifecycle reenabling, shell, SDK import or arbitrary package hook is used.
  const child = spawn(plan.command, plan.args, plan.options);
  if (child.error || child.status !== 0 || child.signal) throw Error('Approved ffmpeg installer did not complete');
  for (const [name, expected] of Object.entries(PINS.ffmpeg.outputs)) {
    const actual = measure(path.join(plan.ffmpegDir, name), 'sha256');
    if (actual.size !== expected.size || actual.digest !== expected.sha256 || (name === 'ffmpeg' && !actual.executable)) throw Error('Downloaded approved ffmpeg artifact does not match pinned release bytes');
  }
  const probe = measure(path.join(plan.ffprobeDir, PINS.ffprobe.binaryPath), 'git-sha1');
  if (probe.size !== PINS.ffprobe.binarySize || probe.digest !== PINS.ffprobe.binaryGitBlobSHA1 || !probe.executable) throw Error('Bundled approved ffprobe artifact does not match referenced source bytes');
  return {installer: 'ffmpeg-static@' + PINS.ffmpeg.version, release: PINS.ffmpeg.release, binarySHA256: PINS.ffmpeg.outputs.ffmpeg.sha256,
    ffprobe: 'ffprobe-static@' + PINS.ffprobe.version, otherLifecycleScripts: 'disabled'};
}
if (require.main === module) {
  try {console.log(JSON.stringify(installApproved()));} catch (error) {console.error(error.message);process.exitCode = 1;}
}
module.exports = {PINS, qualify, hashFile, installApproved};
