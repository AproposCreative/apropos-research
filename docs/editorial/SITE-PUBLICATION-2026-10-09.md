# Owner-authorized full Webflow publication, 9 October 2026

## Authorization and scope

After the text-free Wolverine cover proposal and completed MCP policy release,
Frederik instructed: **“Publiser hele sitet når du er færdig”**. This supersedes
the earlier instruction to defer the full-site publication. The owner was told
that a full publication also includes other pending site changes; no assertion
is made that Webflow exposes a complete design change diff.

Site: Apropos Magazine `67dbf17ba540975b5b21c180`.
Destinations: existing production custom domains `www.aproposmagazine.com`,
`aproposmagazine.com`, `www.aproposmagazine.dk`, `aproposmagazine.dk`.
The Webflow staging subdomain is not included. No new article, AI generation,
provider hold/budget change, Instagram action or analytics activation.

## Prepared and verified before site publication

- Existing Wolverine item `6ac7a31e994128467aa26e6a`, both DA and EN locales.
  Only `thumb` and `mobile-image` changed, including descriptive localized alt.
  Full before/after field checks preserved Peter Milo, 4/6, disclosure, human
  authorship, text, body images, slug, category/topics and SEO.
- Text-free original from the official PlayStation source documented in
  `WOLVERINE-TEXT-FREE-COVER-2026-10-09.md`. Deterministic WebP outputs preserve
  framing: hero 1600×900 / 158,124 bytes; mobile 1200×675 / 97,042 bytes.
- Hero SHA256 `b40644feeef08e0fb74c71ca3bc2106dad54f29d2ff6f90c34abde28ec9301ff`.
  Mobile SHA256 `df6dfb43994b9d39305907eb7601513d6ca09f6c507073463b663aeace750cb7`.
- CMS readback after selective API updates:
  DA `f094ea0a85be7ba5709ac97ee4a7f545e0f94cba93c092cbd55572b38de448d0`;
  EN `d8ba0f7158d4a9c19560a753bcd4570af3671413d18f9e57741e6401eff7d95c`.
  Each matched staging/live; shared write leases, source identity, immutable
  originals, upload/write intent and saved derivatives were preserved under
  `editorialMaintenance/wolverine-text-free-cover-2026-10-09-v1`.
- Articles Template footer was re-read twice. Reversing the exact tested patch
  reproduced the current footer byte-for-byte, so no concurrent changes were
  discarded. Installed `docs/webflow-embeds/article-review-footer.html` and
  verified exact stored readback. Seven isolated footer tests passed again.
  Original retained in `tmp/webflow-articles-template-before-20261009.json`.
- Shared site head/footer, Analytics/GTM and page Open Graph settings untouched.
  The separate audio-player release and text-free MCP guidance remain deployed.

## Publication and public readback

- One full-site publication accepted at approximately `2026-10-09T09:10:38Z`,
  task `e2b7b3f4-9f87-4492-9246-3daf9f74b581`, scope `site`, no staging subdomain.
- Subsequent authenticated site readback reports **all four custom domains**
  `lastPublished` and `fullSiteCompiledAt = 2026-10-09T09:10:57.322Z`
  (11:10:57 Europe/Copenhagen). The top-level site's old timestamp did not
  update: use the actual destination-domain receipts, not that stale field.
- Public and CMS verification completed `2026-10-09T09:13:31.932Z`:
  both localized article URLs HTTP 200; exact hero/mobile SHA256 bytes match
  the prepared outputs after Webflow rehosting; all non-image fields unchanged;
  staging/live equal; both body images preserved. SEO title, meta description
  and canonical match their CMS values.
- The public sitemap now contains **both** DA and EN Wolverine article URLs.
- All four production home URLs resolve to HTTP 200 on the canonical
  `https://www.aproposmagazine.com/`; the existing .dk/non-www redirects remain.
- Real browser runtime confirms exactly one `Review` in each Wolverine locale,
  `itemReviewed.@type=VideoGame`, `itemReviewed.name=Marvel’s Wolverine`,
  reviewer Peter Milo and 4/6. Review headline follows the actual DA/EN headline
  without appending a duplicate review suffix.
- Book regression on `boganmeldelse-i-mellemtiden-er-vi-ingen` preserves Book,
  work title, Frederik Drescher Kluth as book author, Liv Brandt as reviewer and
  5/6. Artigeardit's unrated cultural article returns Article only, no Review.
- New cover is visually confirmed loaded on the public page, not just in CMS.
  Screenshot: `output/wolverine-text-free-live-2026-10-09.png`.
- Saved local receipt `tmp/full-site-publish-receipt-20261009.json`; verification
  `tmp/wolverine-cover-release-verification.json`, also saved in the durable
  maintenance audit above. No duplicate article or repeat site publish.

## Remaining separate limitations

- Raw HTML still reports `og:type=website`. Webflow's inspected page settings,
  Data API page-metadata contract and Designer metadata interface do not expose
  that property. No duplicate Open Graph tag or client-only workaround was
  inserted and this issue is **not** claimed fixed by the schema release.
- Listening analytics remains unactivated pending its separately documented
  Google Analytics access and consent setup; publication does not satisfy those
  dependencies. See `ARTICLE-AUDIO-TRACKING-2026-10-09.md`.
- This is a Webflow content/template release, not a new Vercel code deployment.
  Existing MCP text-free guidance release remains unchanged. No paid AI calls.
