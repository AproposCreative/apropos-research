import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { storeAttachmentBuffer, readStoredAttachment } from '@/lib/accreditation/attachments';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(['../outside', '/tmp/outside', 'nested/id', 'a\\b', '.', '', 'a'.repeat(161)])('rejects unsafe request ID %s before writing', async requestId => {
  const write = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
  await expect(storeAttachmentBuffer({ requestId, filename: 'pass.pdf', buffer: Buffer.from('%PDF-1.4') })).rejects.toThrow('invalid_attachment_request_id');
  expect(write).not.toHaveBeenCalled();
});
it.each(['../accreditation-attachments-other/secret.pdf', '/tmp/secret.pdf', 'id/../secret.pdf', 'id\\secret.pdf', 'id/./secret.pdf'])('does not read unsafe stored path %s', async stored => {
  const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('secret'));
  expect(await readStoredAttachment(stored)).toBeNull(); expect(read).not.toHaveBeenCalled();
});
it('preserves a valid local attachment path and bytes', async () => {
  vi.stubEnv('ACCREDITATION_PERSISTENCE_BACKEND', 'json');
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
  const write = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
  const bytes = Buffer.from('%PDF-1.4 test');
  const asset = await storeAttachmentBuffer({ requestId: 'LIV-123', filename: 'press-pass.pdf', buffer: bytes });
  expect(asset.storagePath).toMatch(/^LIV-123\/[a-f0-9-]+-press-pass\.pdf$/);
  const absolute = path.join(process.cwd(), 'data', 'accreditation-attachments', asset.storagePath!);
  expect(write).toHaveBeenCalledWith(absolute, bytes);
  const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(bytes);
  expect(await readStoredAttachment(asset.storagePath!)).toEqual(bytes);
  expect(read).toHaveBeenCalledWith(absolute);
});
