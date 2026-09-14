import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { prepareFfmpeg } from '../scripts/prepare-ffmpeg.mjs';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('runs only the reviewed installer and verifies its binary', () => {
  vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  vi.stubEnv('FFMPEG_BINARIES_URL', 'https://unapproved.invalid');
  vi.stubEnv('FFMPEG_BIN', '/unexpected/binary');
  vi.stubEnv('npm_config_arch', 'other-platform');
  const run = vi.fn().mockReturnValue({ status: 0, stdout: 'ffmpeg version test' });
  const binary = prepareFfmpeg({ run });
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[0][1][0]).toMatch(/ffmpeg-static\/install.js$/);
  expect(run.mock.calls[0][2].env.FFMPEG_BINARIES_URL).toBeUndefined();
  expect(run.mock.calls[0][2].env.FFMPEG_BIN).toBeUndefined();
  expect(run.mock.calls[0][2].env.npm_config_arch).toBeUndefined();
  expect(run.mock.calls[1][0]).toBe(binary);
  expect(run.mock.calls[1][1]).toEqual(['-version']);
});

it('reuses and verifies the installed binary without another download', () => {
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  const run = vi.fn().mockReturnValue({ status: 0, stdout: 'ffmpeg version test' });
  prepareFfmpeg({ run });
  expect(run).toHaveBeenCalledTimes(1);
});

it('fails closed when installation fails', () => {
  vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  const run = vi.fn().mockReturnValue({ status: 1 });
  expect(() => prepareFfmpeg({ run })).toThrow('installation failed');
  expect(run).toHaveBeenCalledTimes(1);
});

it('fails closed for a non-executable or incomplete binary', () => {
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  const run = vi.fn().mockReturnValue({ status: 0, stdout: 'not ffmpeg' });
  expect(() => prepareFfmpeg({ run })).toThrow('executable verification failed');
});

it('does not execute changed installer code', () => {
  const read = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) =>
    String(file).endsWith('/install.js') ? Buffer.from('changed') : (read as any)(file, ...args)) as any);
  const run = vi.fn();
  expect(() => prepareFfmpeg({ run })).toThrow('installer changed');
  expect(run).not.toHaveBeenCalled();
});
