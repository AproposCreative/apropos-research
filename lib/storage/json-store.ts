import fs from 'fs';
import path from 'path';

function dataPath(filename: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(filename)) throw new Error('invalid_storage_filename');
  // Tests and local recovery must never fall through to tracked research data.
  const configured = process.env.RAGE_STORAGE_DIR?.trim();
  if (process.env.VITEST && !configured) throw new Error('test_storage_directory_required');
  // An explicitly configured directory contains runtime/test data, not bundled
  // source assets. Never infer a build-time glob over the whole checkout from it.
  if (configured) return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured, filename);
  // Keep the default readable assets statically scoped for server file tracing.
  return path.join(process.cwd(), 'data', filename);
}

export function readJsonFile<T>(filename: string, fallback: T): T {
  const filePath = dataPath(filename);
  try {
    if (process.env.RAGE_STORAGE_DIR?.trim()) {
      // Explicit runtime data is not a deployable project asset. Keep both
      // existence and content reads out of build-time source-file discovery.
      if (fs.existsSync(/* turbopackIgnore: true */ filePath))
        return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ filePath, 'utf8')) as T;
    } else {
      const bundledPath = path.join(process.cwd(), 'data', filename);
      if (fs.existsSync(bundledPath)) return JSON.parse(fs.readFileSync(bundledPath, 'utf8')) as T;
    }
  } catch {
    /* use fallback */
  }
  return fallback;
}

export function writeJsonFile<T>(filename: string, data: T): void {
  const filePath = dataPath(filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}
