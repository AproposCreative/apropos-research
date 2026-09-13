# Budget and research release, 2026-09-13

- Commit: b81651d3d4ac155a04d723e6748193983cb8214f
- Git remote branch readback matched this exact SHA after non-force push.
- Production deployment: dpl_F2cHqAHK3TYSLHjj17ZX2Z3197sH
- Vercel deployment state READY; project production target matched ID and SHA.
- URL: https://ai.aproposmagazine.com (Next.js).
- Build duration not recorded; runtime error/drain scan not performed in this check.

## Verification

- 91 focused tests passed without paid API requests; TypeScript passed before push.
- After deployment, authenticated GET /api/ai-cost/summary reports shared activation
  enabled, included scopes liv/writer/seo/accreditation, ready_partial and
  fullMonthlyCapVerified=false. Tracked usage upper estimate 46.561592 DKK;
  this is not actual invoiced spend and excludes historical untracked costs.
- Authenticated POST /api/research-engine with empty topic returns the new 400
  validation response. No research or model work requested.
- Immediately before deployment, authenticated feed GET returned 200, preparation
  and queue enabled, with Freud Sep14, Frankenstein Sep15 and Klovn Sep16; each
  had no publication blockers. This was readback, not a new publication attempt.

## Remaining

Global budget coverage is incomplete; independent quality/media/newsletter paths
still need tracing. Full ops/admin UX and cleanup remain open. Future scheduled
publication is not proven by an enabled flag or READY deployment; seven daily
publication readbacks remain required. Instagram was not enabled or changed.
