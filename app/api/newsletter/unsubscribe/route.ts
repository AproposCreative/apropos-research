import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { verifyUnsubscribeToken } from '@/lib/newsletter/unsubscribe-token';
import { addUnsubscribe } from '@/lib/newsletter/unsubscribe-store';

function htmlPage(title: string, body: string, ok: boolean) {
  const bg = ok ? '#0f1a12' : '#1a0f0f';
  const accent = ok ? '#6ee7a5' : '#f87171';
  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e8e8e8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="max-width:420px;text-align:center;padding:32px 28px;border-radius:16px;background:${bg};border:1px solid rgba(255,255,255,0.1);">
    <p style="margin:0 0 12px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.45);">Apropos Magazine</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${accent};">${title}</h1>
    <p style="margin:0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.75);">${body}</p>
    <p style="margin:24px 0 0;font-size:13px;"><a href="https://www.aproposmagazine.com/" style="color:rgba(255,255,255,0.55);">aproposmagazine.com</a></p>
  </div>
</body>
</html>`;
}

/**
 * Ét klik fra nyhedsbrev: verificerer token og gemmer framelding i Firestore.
 */
export async function GET(req: NextRequest) {
  const secret = env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim();
  if (!secret) {
    return new NextResponse(
      htmlPage(
        'Framelding utilgængelig',
        'Nyhedsbrevs-framelding er ikke konfigureret på serveren. Skriv til hej@aproposmagazine.com.',
        false
      ),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const raw = req.nextUrl.searchParams.get('t');
  if (!raw?.trim()) {
    return new NextResponse(
      htmlPage('Ugyldigt link', 'Manglende eller ugyldig sikkerhedskode i linket.', false),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  let token = raw.trim();
  try {
    token = decodeURIComponent(token);
  } catch {
    /* use raw */
  }

  const verified = verifyUnsubscribeToken(token, secret);
  if (!verified) {
    return new NextResponse(
      htmlPage(
        'Linket er ugyldigt',
        'Frameldingslinket er udløbet eller ugyldigt. Skriv til hej@aproposmagazine.com, hvis du vil frameldes.',
        false
      ),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const result = await addUnsubscribe(verified.email);

  if (!result.ok) {
    return new NextResponse(
      htmlPage(
        'Kunne ikke registrere framelding',
        `Der opstod en teknisk fejl (${result.error || 'ukendt'}). Skriv til hej@aproposmagazine.com med din e-mail, så fjerner vi dig manuelt.`,
        false
      ),
      { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  return new NextResponse(
    htmlPage(
      'Du er frameldt',
      `<strong>${verified.email}</strong> modtager ikke flere nyhedsbreve fra os. Du kan altid tilmelde dig igen på aproposmagazine.com.`,
      true
    ),
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}
