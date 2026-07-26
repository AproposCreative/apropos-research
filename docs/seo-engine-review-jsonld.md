# Server-rendered Review JSON-LD

## Status

Review JSON-LD is built **server-side** in the SEO Engine (`lib/seo-engine/jsonld.ts` + `review-schema.ts`) and serialized to raw HTML via `lib/seo-engine/jsonld-html.ts`.

Live `aproposmagazine.com` still injects Review via **client-side Webflow custom code** (`data-apropos-review-schema` on `DOMContentLoaded`). That runtime script is outside this repo.

CMS publishability for `jsonLd` remains `generated_not_published` until Webflow head embeds the server output (see manual steps below).

## Rules

| Schema | When |
|--------|------|
| Article / NewsArticle + WebPage | Always |
| Review | Review artikeltype **and** rating 1–6 **and** itemReviewed name |
| Event | Only with verified `eventDate` + place; never invented |

- `itemReviewed.@type` from artikeltype → entity/topic → `CreativeWork` fallback
- Supported: Movie, TVSeries, VideoGame, MusicAlbum (+ MusicEvent/Festival/TheaterEvent/VisualArtwork when typed)
- Event-like itemReviewed without verified event data → `CreativeWork`
- Rating scale: `bestRating=6`, `worstRating=1`
- Preserve original `datePublished`; `dateModified` is separate
- No duplicate Review nodes in `@graph`

## Manual team steps (Webflow)

To get Review into **raw HTML without JavaScript** on the live site:

1. In Webflow Designer → Article template custom code, **remove** the client-side Review injector (`DOMContentLoaded` + `data-apropos-review-schema`).
2. Either:
   - **A)** Emit a static `<script type="application/ld+json">` Review block with CMS bindings (stjerne, name, dates, author, section/topic), or
   - **B)** Add a Plain Text CMS field (e.g. `review-json-ld`) and bind it into `<head>` as the script body; then wire SEO Engine publish to fill that field.
3. Keep the existing Article JSON-LD + canonical/`inLanguage` logic.
4. Verify with View Source (not DevTools Elements): Review must appear before any JS runs.
5. Re-test film, serie, spil, album, and a non-review (guide) page.

No credentials are stored in this document.
