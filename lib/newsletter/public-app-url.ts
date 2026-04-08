import type { NextRequest } from 'next/server';
import { env } from '@/lib/config/env';

/** Absolut origin til redirects (frameld m.m.) — foretrækker request-host på Vercel. */
export function getPublicAppOriginFromRequest(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-host');
  const host = forwarded || req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  const fromEnv = env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const vercelProd = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${vercelProd.replace(/^https?:\/\//, '')}`;
  const vercel = env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:3000';
}
