/** Transactional bekræftelse — ingen afmeld-link (brugeren er allerede frameldt). */
export function buildUnsubscribeConfirmationHtml(): string {
  return `<!DOCTYPE html>
<html lang="da">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;color:#e8e8e8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;border-radius:12px;border:1px solid #2a2a2a;background:#111;padding:28px 24px;">
        <tr><td>
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#fafafa;">Du er frameldt</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#c4c4c4;">
            Vi har registreret, at du ikke længere vil modtage nyhedsbrev fra Apropos Magazine. Du behøver ikke gøre mere.
          </p>
          <p style="margin:0;font-size:15px;line-height:1.55;color:#c4c4c4;">
            Vil du tilbage senere, kan du altid tilmelde dig igen på vores website.
          </p>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#888;">
            Spørgsmål? Skriv til <a href="mailto:hej@aproposmagazine.com" style="color:#a3a3a3;">hej@aproposmagazine.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
