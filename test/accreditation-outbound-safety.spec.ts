import { describe, expect, it } from 'vitest';
import {
  applyTestRedirectToMailContent,
  resolveAccreditationOutboundRecipient,
} from '@/lib/accreditation/outbound-safety';

describe('accreditation outbound safety', () => {
  it('redirects all recipients to the test sink when configured', () => {
    const prevRedirect = process.env.ACCREDITATION_TEST_REDIRECT_TO;
    const prevAllow = process.env.ACCREDITATION_OUTBOUND_ALLOWLIST;
    process.env.ACCREDITATION_TEST_REDIRECT_TO = 'frederik.emil.kragh@gmail.com';
    delete process.env.ACCREDITATION_OUTBOUND_ALLOWLIST;
    try {
      const resolved = resolveAccreditationOutboundRecipient('presse@kbhallen.dk');
      expect(resolved.redirected).toBe(true);
      expect(resolved.blocked).toBe(false);
      expect(resolved.to).toBe('frederik.emil.kragh@gmail.com');
      expect(resolved.intendedTo).toBe('presse@kbhallen.dk');

      const content = applyTestRedirectToMailContent({
        subject: 'Ansøgning',
        text: 'Hej',
        html: '<p>Hej</p>',
        intendedTo: resolved.intendedTo,
        redirected: true,
      });
      expect(content.subject).toMatch(/^\[TEST → presse@kbhallen\.dk\]/);
      expect(content.text).toMatch(/TEST-REDIRECT/);
    } finally {
      if (prevRedirect === undefined) delete process.env.ACCREDITATION_TEST_REDIRECT_TO;
      else process.env.ACCREDITATION_TEST_REDIRECT_TO = prevRedirect;
      if (prevAllow === undefined) delete process.env.ACCREDITATION_OUTBOUND_ALLOWLIST;
      else process.env.ACCREDITATION_OUTBOUND_ALLOWLIST = prevAllow;
    }
  });
});
