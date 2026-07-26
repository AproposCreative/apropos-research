# JSON-LD notes (v1.1)

- Brug `@context: https://schema.org` og `@graph`.
- Article/NewsArticle + WebPage altid (server-side, deterministisk).
- Review **kun** når artikeltype er anmeldelse **og** gyldig rating (1–6) **og** itemReviewed-navn findes.
- itemReviewed.@type fra artikeltype/entity/topic (Movie, TVSeries, VideoGame, MusicAlbum, …) — ikke keyword-gæt alene.
- Event-schema kun med verificerede eventdata (dato + sted). Aldrig på øvrige artikler.
- Bevar `datePublished` (original); `dateModified` er separat.
- Rating-skala: bestRating=6, worstRating=1.
- Server renderer: `lib/seo-engine/jsonld-html.ts` → raw HTML `<script type="application/ld+json">` uden client JS.
- CMS publishability for jsonLd forbliver `generated_not_published` indtil Webflow head embedder server-output (se `docs/seo-engine-review-jsonld.md`).
