import { expect, it, vi } from 'vitest';
const getClient = vi.hoisted(() => vi.fn(() => { throw new Error('paid_metadata_forbidden'); }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: getClient }));
import { classifyAttachmentMetadata } from '@/lib/accreditation/attachment-meta';

it.each([
  ['ticket.pdf', 'attachment'],
  ['QR.png', 'qr_text'],
  ['badge-qr.pdf', 'attachment'],
  ['confirmed-approved.txt', 'attachment'],
  ['unknown.dat', 'attachment'],
])('classifies %s locally without paid calls or inferred approval', async (filename, kind) => {
  expect(await classifyAttachmentMetadata({ filename })).toEqual({ kind, label: filename });
  expect(getClient).not.toHaveBeenCalled();
});
