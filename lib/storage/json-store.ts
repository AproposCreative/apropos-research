import fs from 'fs';
import path from 'path';

function dataPath(filename: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(filename)) throw new Error('invalid_storage_filename');
  // Tests and local recovery must never fall through to tracked research data.
  const configured = process.env.RAGE_STORAGE_DIR?.trim();
  if (process.env.VITEST && !configured) throw new Error('test_storage_directory_required');
  return path.resolve(process.cwd(), configured || 'data', filename);
}

export function readJsonFile<T>(filename: string, fallback: T): T {
  const filePath = dataPath(filename);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
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
