# Arkiv: Nyhedsbrev «Layout-test» (magasin-blok)

Fjernet fra produktion **2026-04-09**. Her ligger en komplet snapshot til genindførelse senere.

## Hvad det var

- Ekstra sektion i mailen **under** «Udvalgte artikler»: op til **3** artikler med kvadratisk thumb, titel, undertitel, stjerner (1–6), pille-CTA «Læs nu», skillelinjer.
- Kræver CMS-felter på `NewsletterArticle`: `subtitle`, `ratingStars`, `metaCategoryLine` (sidstnævnte stadig i koden til evt. fremtidig brug).

## Genindførsel (kort)

1. Kopier `layout-lab-styles.ts` tilbage til `lib/newsletter/layout-lab-styles.ts`.
2. Flet indholdet af `render-html-additions.md` ind i `lib/newsletter/render-html.ts` (import, hjælpefunktioner, mobil-CSS, `layoutLabSection` + `${layoutLabSection}` i skabelonen).
3. Genskab de fjernede `nl-exp-*` regler i `public/newsletter/newsletter-shared.css` fra `newsletter-shared-css-snippet.css` (eller sammenlign med git-historik på denne mappe).
4. Bump `DRAFT_TEMPLATE_VERSION` i `lib/newsletter/draft-cache.ts` så gamle caches ikke genbruges med forkert HTML.

## Filer i mappen

| Fil | Formål |
|-----|--------|
| `layout-lab-styles.ts` | Design-tokens (kopier til `lib/newsletter/`) |
| `render-html-additions.md` | Præcis tekst der skal ind i `render-html.ts` |
| `newsletter-shared-css-snippet.css` | Uddrag til `newsletter-shared.css` |

---

## Før GitHub-deploy (tjekliste, 2026-04-09)

- Kør `npm run type-check` og `npm run build` lokalt.
- `CRON_SECRET` og øvrige produktions-variabler er sat på Vercel (ingen ikke-ASCII i header-værdier).
- Efter merge: bekræft at preview-nyhedsbrev ser rigtigt ud (layout-test er **fra** — kun standard «Udvalgte artikler» + CTA + footer).
