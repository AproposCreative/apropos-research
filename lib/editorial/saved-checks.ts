import { z } from 'zod';
import { sourceUrl } from '@/lib/factcheck/source-reader';
const url = z.string().max(4000).refine(value => {
  try { return ![...sourceUrl(value).searchParams.keys()].some(k => /token|secret|password|signature|credential|api.?key/i.test(k)); }
  catch { return false; }
});
const report = z.object({ articleHash: z.string().regex(/^[a-f0-9]{64}$/), checkedAt: z.string().max(60),
  policyVersion: z.string().max(100).optional(), complete: z.boolean(), blockers: z.array(z.string().max(500)).max(200),
  coverage: z.object({ expectedUnits: z.number(), checkedUnits: z.number() }),
  results: z.array(z.object({ claim: z.string().max(6000), status: z.string().max(100), evidence: z.string().max(6000),
    citations: z.array(z.object({ sourceId: z.string().max(100), url, quote: z.string().max(6000) })).max(30) })).max(200),
  sources: z.array(z.object({ id: z.string().max(100), url, title: z.string().max(1000), contentHash: z.string().max(64),
    retrievedAt: z.string().max(60), publishedAt: z.string().max(60).nullable() })).max(30),
});
/** Strict projection of historical fact evidence; never re-label as current approval. */
export function savedFactualChecks(gates: unknown) {
  if (!Array.isArray(gates)) return [];
  return gates.filter(g => g?.name === 'factcheck').map(g => {
    const parsed = report.safeParse(g.evidence || g.diagnosticEvidence);
    return { name: 'factcheck', historicalPass: g.pass === true, report: parsed.success ? parsed.data : null,
      reportAvailable: parsed.success, freshness: 'not_revalidated', publicationApproval: false };
  });
}
