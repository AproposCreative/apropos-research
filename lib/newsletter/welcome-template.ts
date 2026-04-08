import { NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER } from '@/lib/newsletter/inject-unsubscribe';

/** Simpel velkomstmail — unsubscribe-link indsættes ved send (samme som nyhedsbrev). */
export function buildWelcomeSignupHtml(): string {
  return `<!DOCTYPE html>
<html lang="da">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;color:#e8e8e8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;border-radius:12px;border:1px solid #2a2a2a;background:#111;padding:28px 24px;">
        <tr><td>
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#fafafa;">Velkommen</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#c4c4c4;">
            Tak for din tilmelding til nyhedsbrevet. Du hører fra os, når der er nyt på Apropos.
          </p>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#888;">
            <a href="${NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER}" style="color:#a3a3a3;">Frameld nyhedsbrev</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
