import { expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { simpleParser } from 'mailparser';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

// Real MIME/codec libraries, no network or provider keys.
it('preserves Danish copy, threading and exact attachment bytes in send/archived MIME', async () => {
  const attachment = Buffer.from('Originale æøå-bytes til akkreditering');
  const message = { from: 'Liv <liv@example.test>', to: 'Milo <milo@example.test>',
    replyTo: 'redaktion@example.test', subject: 'Svar: København, øer og åben kultur',
    text: 'Hej Milo. Her er svaret, præcis som godkendt.', html: '<p>Hej Milo. Her er svaret, præcis som godkendt.</p>',
    headers: { 'In-Reply-To': '<original@example.test>', References: '<original@example.test>', 'X-Apropos-LivInbox-Item': 'fixture-only' },
    attachments: [{ filename: 'Bilag-æøå.txt', content: attachment, contentType: 'text/plain' }] };
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  try {
    const result = await transport.sendMail(message);
    const archived = await new MailComposer({ ...message, messageId: result.messageId }).compile().build();
    for (const raw of [result.message, archived]) {
      const mail = await simpleParser(raw as Buffer);
      expect(mail.subject).toBe(message.subject); expect(mail.text?.trim()).toBe(message.text);
      expect(mail.inReplyTo).toBe('<original@example.test>'); expect(mail.references).toBe('<original@example.test>');
      expect(mail.messageId).toBe(result.messageId); expect(mail.attachments).toHaveLength(1);
      expect(mail.attachments[0].filename).toBe('Bilag-æøå.txt'); expect(mail.attachments[0].content).toEqual(attachment);
    }
  } finally { transport.close(); }
});
it.each(['jpeg', 'png', 'webp'] as const)('decodes real %s and derives WebP without modifying the original', async format => {
  const original = await sharp({ create: { width: 192, height: 128, channels: 3, background: '#f2e8d5' } }).toFormat(format).toBuffer();
  const hash = createHash('sha256').update(original).digest('hex');
  const derivative = await sharp(original, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 120 }).webp({ quality: 75 }).toBuffer();
  expect(await sharp(original).metadata()).toMatchObject({ format, width: 192, height: 128 });
  expect(await sharp(derivative).metadata()).toMatchObject({ format: 'webp', width: 120, height: 80 });
  expect(derivative.byteLength).toBeGreaterThan(0); expect(createHash('sha256').update(original).digest('hex')).toBe(hash);
});
it('does not decode HTML or an empty response as an image', async () => {
  for (const bytes of [Buffer.from('<html>Login required</html>'), Buffer.alloc(0)]) await expect(Promise.resolve().then(() => sharp(bytes).metadata())).rejects.toThrow();
});
