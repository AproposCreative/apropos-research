# Desktop Writer restoration, 30 October 2026

Owner request: restore desktop startup in AI Writer with the existing large
robot and all built tools in the menu. Preserve the newer mobile tool layout.

## Cause and correction

`/ai` resolved to a null view, which rendered the shared full-width tool launcher
on desktop. Its opaque black background covered the unchanged Spline robot and
Writer never opened. The earlier layout verification used an explicit `view=ai`
fixture; it did not catch the root-route regression.

The view resolver now accepts a fallback: desktop uses `ai`, mobile uses the
launcher. Explicit and legacy tool links keep precedence. The launcher can render
only on mobile. The existing desktop Web-apps menu lists all permitted tools,
including paused tools with their honest status, without a hidden-tools fold.
Permissions, budgets, provider state and personal approvals are unchanged.

Writer body/layout, wizard, chat, original Spline scene and settings, saved work,
autosave, generation, podcast delivery and other tool implementations are retained.
Only the entry-point resolver, viewport selection and menu visibility change.

## Verification

- 57 focused tests passed: desktop/mobile fallback, all 11 explicit views, eight
  legacy route aliases, workspace restore/autosave ownership, tool status/access
  and catalogue routing. App TypeScript and build security checks also passed.
- Isolated Chromium uses the actual Writer parent/chat/wizard, URL resolver,
  desktop toolbar/menu, tool list and Spline embed. Service calls are fixtures;
  other tools' business content is isolated, so no generation/publication occurs.
- `/ai` with no query opens Writer at 1440px; no desktop launcher. The original
  robot iframe occupies the background and is the top hit target in its open
  region. Original scene URL returns HTTP 200. This does not claim a new rendered
  WebGL performance acceptance test of the third-party scene.
- All 13 catalogue/shelf entries are visible in the desktop menu, including
  Image-gen and Akkreditering. Ten internal tool selections update their correct
  URL and return to Writer. The external ChatGPT link is retained.
- 1024px desktop, explicit podcast deep link, refresh and 390px mobile launcher
  followed by Writer selection pass. No JavaScript errors or paid/provider,
  publication or mail calls in the fixture. Screenshots and exact results are in
  `output/desktop-restore-20261030/`.

## Production readback

Verified **2026-10-30T17:14:55.773Z**: release
`cea833d75df1469e597c13529195da1dae986208`, READY deployment
`dpl_Bqh81cLS7AVxrLaVpUjqhyB34KuP`, alias `ai.aproposmagazine.com`.
Root `/ai` returns HTTP 200. The actual served Writer bundle contains the
desktop `ai` fallback and full-menu flag; the shared bundle retains the original
robot URL. Served Writer chunk SHA-256:
`801fe453c512e6c66b3429f323831850f303134c76ea5ec7d7f6a09781c16c4a`.

The existing podcast feed still returns HTTP 200, `X-Podcast-Metadata: synced`
and all 130 episodes. Seven other protected Writer files match their pre-change
hashes; the two intentional Writer changes are the startup wiring and resolver.
No chat/wizard/editor rewrite, provider call, mail send, CMS write, budget change
or stored-work migration. The permanent root-route regression rule is in AGENTS.

Evidence: `output/desktop-restore-20261030/production-verification.json`,
`ui-verification.json`, root/menu/mobile screenshots and the isolated fixture.
