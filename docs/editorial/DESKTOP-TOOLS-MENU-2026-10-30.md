# Restore the original desktop tool menu, 30 October 2026

The owner requested the previous desktop menu appearance. The original
`WebAppsPanel` in Git used a transparent Poppins panel, compact “Web-apps” header,
separate rounded bordered cards, 40px letter/icon tiles, microphone for Podcast
and the original desktop ordering. The later shared mobile list had replaced it.

`DesktopToolsMenu` restores those desktop styles and ordering while retaining the
current capability-filtered catalogue and all 13 tool/shelf entries. New tools,
the external ChatGPT link and current names remain available. Paused automation
has a compact badge; full current status remains accessible and in its tooltip.
Opening a tool does not change its authorization, provider policy or pause.

The existing desktop `showAllTools` branch selects this presentation. The mobile
launcher/list is unchanged. No Writer, startup, robot, SoMe renderer, catalogue
service, saved work, mail, publication or budget changes.

Verification: 32 focused routing/status/access tests and app TypeScript passed.
The actual Writer/menu/toolbar fixture passed desktop root startup, all 13 menu
entries, ten internal tool-and-back round trips, explicit deep links, tablet,
mobile launcher and mobile Writer selection without errors. The settled desktop
panel was visually inspected at its full 300px width: original bordered cards,
40px icon tiles, compact names and header. Services/business content are fixtures;
no real AI, provider, mail or publication calls. Build security and diff checks pass.

Evidence and screenshots: `output/desktop-menu-20261030/`.

## Production readback

Verified **2026-10-30T17:28:49.300Z**: release
`73d5357d4dcf36115a453a0674f5a23381e23bf7`, READY deployment
`dpl_H6sGZaTQSbAgsWEJKckCYVTRgsEn`, alias `ai.aproposmagazine.com`.
`/ai` returns HTTP 200 and serves the desktop card menu and its separate original
presentation stylesheet. Served menu chunk SHA-256:
`a7b96f79ad612910af623ae3bc242757aa8bfed33922986e030db5b367c6ad78`.
Stylesheet SHA-256:
`13e64793ce3a0d14e65a1dce849922893c000c390f43b0166a09b87914786f30`.

Public bundles still contain the desktop Writer startup and original robot URL.
The mobile list and all catalogue entries remain retained. No provider requests,
real posts or stored-data writes. Receipt: `production-verification.json` in the
evidence directory. The distinct desktop design is also recorded in AGENTS.
