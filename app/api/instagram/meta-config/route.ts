import { NextResponse } from 'next/server';

/**
 * GET /api/instagram/meta-config
 * Fortæller om META_APP_ID + META_APP_SECRET er sat (til token-konvertering / diagnose).
 * Afslører ikke værdier.
 */
export async function GET() {
  const hasId = Boolean(process.env.META_APP_ID?.trim());
  const hasSecret = Boolean(process.env.META_APP_SECRET?.trim());
  const missing: string[] = [];
  if (!hasId) missing.push('META_APP_ID');
  if (!hasSecret) missing.push('META_APP_SECRET');

  return NextResponse.json({
    exchangeReady: hasId && hasSecret,
    missing,
  });
}
