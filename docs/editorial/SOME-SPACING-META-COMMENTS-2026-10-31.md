# SoMe spacing and Facebook comment diagnosis, 31 October 2026

The owner requested a check of the Terminal List season 2 publishing errors and
an adjustable distance between a card's headline and subtitle.

## Verified incident

Read-only inspection at 14:06 UTC confirmed two separate operations: a feed post
at 13:51 UTC (Instagram and Facebook both published) and an Instagram Story at
13:52 UTC (published). These are different formats, not evidence of a duplicate
attempt. The feed operation's article-link comment was definitely rejected with
Meta code 200. Original operation records and request IDs are retained unchanged.
Facebook's actual post readback returned `is_published=true`.

The retained connection is a valid PAGE token for the configured Page. Its actual
debug scopes include `pages_manage_posts` and `pages_read_engagement`, but omit
`pages_manage_engagement`. Comment readback additionally rejected access for lack
of `pages_read_user_content`; therefore no claim is made that existing comments
were enumerated or that the missing link was repaired. No permission, credential,
token, post, comment, provider budget or reservation was changed. Restoring comment
publishing requires a personally authorised Meta reconnection with comment access.
Evidence: `output/social-spacing-meta-20261031/inspection.json` (no credentials).

## Implementation

- Headline controls expose **Afstand**, **Tættere**, **Mere luft**, and **Auto**.
  The actual gap between glyphs changes independently of font size, in both formats.
  Preview, PNG and publishing JPEG share the same renderer.
- The choice is saved with the source-bound article draft, restored on reload or
  another device, and included in the approved publishing snapshot. Existing drafts
  default to 24 canvas pixels; no bulk draft rewrite is needed. Bounds are 0–120.
- Default spacing retains the historical publication identity. Custom spacing
  identifies a changed design; it never unlocks a retry of the old version.
- Receipts show per-channel publication status separately from the post link.
  A denied Facebook comment is explained specifically, including old receipts,
  without rewriting them or claiming that published posts failed.
- Checking an older receipt keeps the actual newest publication at the top.
  Checking status sends no post or comment. The check button has a busy state.
- Connection diagnostics and reconnection help identify the missing comment scope
  separately from the otherwise working posting connection. No permission is
  granted automatically. Story download is disabled while text validation is pending.

## Verification

- 59 targeted isolated tests passed across six suites, including lost responses,
  old/default deduplication identities, explicit channels, failed comments, spacing
  persistence, invalid inputs, and Page-specific permissions.
- 36 real bundled-Amiri canvas cases passed: square/Story, light/dark, 70/100/150%
  headline sizes, and 0/24/72 pixel gaps. Actual glyph bounds match the requested
  gap; default positions remain unchanged. PNG and JPEG geometry are identical.
- The actual editor fixture passed reload, second-device restore, stale-device
  conflict handling, Story export, explicit channels, duplicate-click protection,
  lost-response readback and layouts at 320/390/768/1440px. Its three publishing
  operations are local fixtures, not real social posts.
- Application TypeScript and scoped ESLint passed. The initial full local build
  exposed unrelated retained scratch TypeScript under `output/`; these files are
  excluded from the isolated application check and are not release source.

## Production verification

- Implementation `9dfdf664ca2fbbfc83ae45a4e0d06397d04cf750`; clean release
  `06d4578bb722c3a034e0a3aff2b2c99d40872cb3` retains all 19 newsletter files
  from the preceding live `02b38b4f` release as exact Git blobs. Unrelated local
  newsletter and observer journal work was not staged, overwritten or deployed.
- The exact release source snapshot passed the full Next build: compilation,
  TypeScript and 249 pages. Four pre-existing podcast filesystem-tracing warnings
  remain. The snapshot did not include local scratch output or credentials.
- Vercel `dpl_5Sm385qdxiSV11PTRJudcLwGuQPE` is READY for the exact release SHA;
  the real `ai.aproposmagazine.com` alias was verified on that deployment.
- Public source readback at 14:18:57 UTC found the spacing controls, saved field,
  specific comment error and access link in the served JavaScript. Draft and
  publishing endpoints still reject anonymous access with 401.
- Actual authenticated browser readback showed the Terminal List season 2 card
  with **Tættere** and **Mere luft**. `live-controls.png` records that view.
  Desktop `/ai` without a view parameter still opens AI Writer, the retained
  Spline background and the original desktop tool catalogue including paused tools.
  No social publish button or spacing change was used in this live check.
- Error/fatal runtime scan scoped to this deployment, 14:08:55–14:18:55 UTC,
  returned no entries. This is a bounded scan, not a claim about all traffic.
- Production source evidence: `output/social-spacing-meta-20261031/release.json`
  and `production-assets.json`. Tests, browser fixture and geometry reports are
  in the same directory. The real Meta permissions remain unchanged; personal
  authorisation for comment access is pending.
