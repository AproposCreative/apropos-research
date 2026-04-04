import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromHtml } from '@/lib/crawler/extractor';

const MAX_TEXT_LENGTH = 5000;
const FETCH_TIMEOUT_MS = 10_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL er påkrævet' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: 'Ugyldig URL' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Kun HTTP/HTTPS URLs understøttes' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let html: string;
    try {
      const res = await fetch(parsed.href, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'AproposBot/1.0 (research assistant)',
          Accept: 'text/html,application/xhtml+xml,*/*',
        },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Kunne ikke hente siden (HTTP ${res.status})` },
          { status: 502 },
        );
      }
      html = await res.text();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return NextResponse.json({ error: 'Timeout — siden svarede ikke inden for 10 sekunder' }, { status: 504 });
      }
      return NextResponse.json({ error: 'Netværksfejl ved hentning af URL' }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }

    const extracted = extractTextFromHtml(html, parsed.href);

    const text = extracted.text.length > MAX_TEXT_LENGTH
      ? extracted.text.slice(0, MAX_TEXT_LENGTH).trimEnd() + '…'
      : extracted.text;

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      title: extracted.title,
      text,
      url: parsed.href,
      wordCount,
    });
  } catch (err) {
    console.error('[extract-url]', err);
    return NextResponse.json({ error: 'Intern serverfejl' }, { status: 500 });
  }
}
