'use client';

import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/react';

/**
 * Client-side wrapper for Vercel Analytics components
 * These components require client-side context to function properly
 */
export default function VercelAnalytics() {
  return (
    <>
      <SpeedInsights />
      <Analytics />
    </>
  );
}
