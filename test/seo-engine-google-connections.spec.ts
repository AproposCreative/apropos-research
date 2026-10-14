import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ gsc: vi.fn(), ga4: vi.fn() }));
vi.mock('@/lib/gsc/google-auth', () => ({ getConfiguredGscSiteUrl: () => 'sc-domain:aproposmagazine.com', getGscAccessToken: async () => 'test-token' }));
vi.mock('@/lib/ga4/property', () => ({ getGa4PropertyResourceName: () => 'properties/123' }));
vi.mock('@/lib/ga4/data-client', () => ({ probeGa4DataAccess: m.ga4 }));
vi.mock('@/lib/seo-engine/search-signals', () => ({ defaultGscFetch: m.gsc }));
import { assessOpportunityConnections } from '../lib/seo-engine/opportunity-engine/connections';
beforeEach(() => { vi.clearAllMocks(); m.gsc.mockResolvedValue({ ok: true, rows: [] }); m.ga4.mockResolvedValue({ ok: true, activeUsers7d: 0 }); });
afterEach(() => vi.unstubAllGlobals());
const webflow = { probeWebflow: async () => ({ ok: true, message: 'configured' }) };
it('probes actual property data, accepting an empty successful Google response without claiming automatic execution', async () => {
  const result = await assessOpportunityConnections(webflow);
  expect(result.healthy).toBe(true); expect(m.gsc).toHaveBeenCalledOnce(); expect(m.ga4).toHaveBeenCalledOnce();
  expect(m.gsc.mock.calls[0][0].body.rowLimit).toBe(1);
  expect(result.summary).not.toContain('drift aktiv');
});
it('does not call token minting proof of Search Console property access', async () => {
  m.gsc.mockResolvedValue({ ok: false, status: 403, message: 'private raw debug' });
  const result = await assessOpportunityConnections(webflow);
  expect(result.canAutoOptimize).toBe(false); expect(result.gsc.message).toContain('403');
  expect(JSON.stringify(result)).not.toContain('private raw');
});
it('reports GA4 failure separately without making up unavailable metrics', async () => {
  m.ga4.mockResolvedValue({ ok: false, error: 'private credential text' });
  const result = await assessOpportunityConnections(webflow);
  expect(result.healthy).toBe(false); expect(result.ga4.ok).toBe(false); expect(result.gsc.ok).toBe(true);
  expect(JSON.stringify(result)).not.toContain('private credential');
});
