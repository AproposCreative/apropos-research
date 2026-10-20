# Dedicated Apropos press page

20 October 2026.

## Delivery state

Created and verified on Webflow staging: https://apropos-magazine.webflow.io/presse.

Production https://www.aproposmagazine.com/presse still returns HTTP 404. No production publish was attempted in this slice. The previously verified full-site date/order regression remains the release dependency; see `WEBFLOW-PROFILE-RELEASE-2026-10-20.md`. The user has authorized deployment. Missing authorization is not the blocker.

## Scope and identities

- Site: `67dbf17ba540975b5b21c180`.
- New primary Danish page: `6ad77b51dc274141752159c0`, slug `presse`.
- Page shell: `d415da41-c8e5-ec64-5a13-2b43e7b9348b`.
- Main content: `97f17cab-85e0-0f38-13a8-6e54b0b9c0a4`.
- Existing Top Bar, Navigation, New Footer and Subscribe Modal instances reused. No component definitions or existing global styles changed.
- New styles are scoped to `press-*`; existing `Page Content` and `Sticky Menu` styles are reused.
- About page `67dbf17ba540975b5b21c217`: added link `a92976bd-0b77-6df1-eb82-26a9d437cd40` with text “Presse og fakta om Apropos ↗” under the existing contact email. Tree comparison against the prior accepted profile state finds exactly the new link and its string child; only the contact container's child list changes. No prior nodes removed or modified.
- No CMS article, Liv workflow, dependency, authentication, application deployment or Instagram publication was changed.

## Content

The page contains a concise presentation with a copy button, verified media/company facts, coverage links, the two existing SVG logos, and the public editorial contact.

The factual basis is the owner's advertising-free positioning and the existing public About page/footer. Founding dates, readership figures, “leading media” rankings, press mentions and funding claims are omitted because the evidence does not establish them.

The logo URLs point to the existing managed assets `67f7966d9192c68997f60640` and `6821b5bfbc78ea7107f64809`. Links are labelled “Åbn … (SVG)” rather than promising an automatic cross-origin download. White preview backgrounds preserve the original black logos in both themes. No new rights claims are made.

## Source and implementation

- `press-page-2026-10-20.html`: content source.
- `press-page-2026-10-20.css`: scoped layout, breakpoints and focus styles.
- `press-page-2026-10-20.js`: page-local clipboard enhancement with text-selection fallback.
- `WEBFLOW-PRESS-AFTER-2026-10-20.json`: final press/About element trees.

The WHTML importer rejected descendant focus selectors, so those two rules are in the new page's head block. The remaining CSS became native Webflow styles. Its Satoshi warning did not reflect the final result: computed typography is `Satoshi, Arial, sans-serif`.

The importer did not resolve the CDN logo URLs automatically. Both image nodes were subsequently bound to the verified existing asset IDs and load correctly. Webflow exports its button as an anchor, so the page-local script upgrades the copy control to a real native button before attaching the handler.

No page-level custom code existed before these additions.

## Verification

- Staging publish task: `6a0b7c8a-5920-4253-9109-159ee35b0775`; `customDomains: []`, `publishToWebflowSubdomain: true`.
- HTTP 200, one H1, one main landmark, correct title, meta description, Open Graph image and canonical `https://www.aproposmagazine.com/presse`.
- New page appears in staging sitemap; About's press link is present.
- All seven distinct HTTP links inside main return 200, including both SVG files.
- Desktop 1200px: document scroll width 1200px.
- Mobile 390px: document scroll width 390px.
- Actual clipboard click reports “Præsentationen er kopieret.”
- Dark mode: main text `rgb(252,252,252)` on `rgb(18,18,18)`; CTA reverses these colors; both SVGs remain visible on white preview backgrounds.
- Node syntax check passes for the small page-local script.
- Browser theme and temporary viewport restored after testing.
- Evidence: `measurements/2026-10-20-press-verification.json` and three screenshots.

## Localization and release continuation

This delivery implements the Danish press page. The existing EN switch currently inherits the Danish content at `/en/presse`, as the existing About page also does. A complete English translation is prepared in `press-page-2026-10-20.en.json`, but not applied. The localized content API returns no nodes for the inherited secondary page; the primary API exposes 29 nodes but omits definition-list facts. Do not claim the English page has been localized or publish a partial mix.

To make the Danish page live, resume the existing profile release's date/order dependency investigation. Establish the actual legacy date binding and Featured sorting source, fix and verify stability across repeat staging publication, then release the profile and press pages through a supported publication path. Do not replace historical publication dates with event dates, creation dates or mutable staging publication timestamps.

After production release, verify `/presse`, the About link, the existing profile/section changes and the previously affected topic dates and Featured ordering. The press page is preserved and reviewable while that dependency remains unresolved.
