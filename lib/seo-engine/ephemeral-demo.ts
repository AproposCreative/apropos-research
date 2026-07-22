import type { NextRequest } from 'next/server';

/**
 * Explicit local/non-prod ephemeral demo — no Firebase, no OpenAI, no persist/publish.
 * Activated only when:
 * - SEO_ENGINE_DEMO=true
 * - NODE_ENV !== 'production'
 * - request header x-seo-engine-ephemeral-demo: 1 (or body.ephemeralDemo)
 *
 * Never a production auth bypass.
 */
export function isEphemeralDemoAllowedByEnv(): boolean {
  return process.env.SEO_ENGINE_DEMO === 'true' && process.env.NODE_ENV !== 'production';
}

export function isEphemeralDemoRequest(req: NextRequest, body?: { ephemeralDemo?: unknown }): boolean {
  if (!isEphemeralDemoAllowedByEnv()) return false;
  if (req.headers.get('x-seo-engine-ephemeral-demo') === '1') return true;
  return body?.ephemeralDemo === true;
}

export function assertEphemeralDemoEnv(): void {
  if (process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('Ephemeral demo er forbudt i production'), {
      code: 'fail_closed',
    });
  }
  if (process.env.SEO_ENGINE_DEMO !== 'true') {
    throw Object.assign(new Error('Sæt SEO_ENGINE_DEMO=true for ephemeral demo'), {
      code: 'fail_closed',
    });
  }
}
