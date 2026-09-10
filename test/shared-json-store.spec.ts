import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readJsonFile, writeJsonFile } from '@/lib/storage/json-store';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it('keeps both reads and writes in the configured isolated directory', () => {
  vi.stubEnv('RAGE_STORAGE_DIR', './tmp/vitest-rage');
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  const read = vi.spyOn(fs, 'readFileSync').mockReturnValue('{"count":2}');
  const mkdir = vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
  const write = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
  expect(readJsonFile('article-test.json', {})).toEqual({ count: 2 });
  writeJsonFile('article-test.json', { count: 3 });
  const directory = path.resolve('./tmp/vitest-rage');
  expect(read).toHaveBeenCalledWith(path.join(directory, 'article-test.json'), 'utf8');
  expect(mkdir).toHaveBeenCalledWith(directory, { recursive: true });
  expect(write).toHaveBeenCalledWith(path.join(directory, 'article-test.json'), expect.any(String), 'utf8');
});
it.each(['../tracked.json', '/tmp/outside.json', 'nested/file.json', 'invalid.txt', ''])('rejects an unsafe filename %s', name => {
  expect(() => readJsonFile(name, {})).toThrow('invalid_storage_filename');
  expect(() => writeJsonFile(name, {})).toThrow('invalid_storage_filename');
});
it('fails closed in tests when isolation is missing', () => {
  vi.stubEnv('VITEST', 'true');
  vi.stubEnv('RAGE_STORAGE_DIR', '');
  expect(() => writeJsonFile('article-test.json', {})).toThrow('test_storage_directory_required');
  expect(() => readJsonFile('article-test.json', {})).toThrow('test_storage_directory_required');
});
it('retains the fallback for a missing data file', () => {
  vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  expect(readJsonFile('missing.json', { count: 0 })).toEqual({ count: 0 });
});
