# Apropos technical SEO, AEO and AI-search audit — 21 October 2026

Production audit captured 17:57–17:59 Europe/Copenhagen, with targeted and browser checks afterwards. This is a dated baseline; subsequent schema or CMS releases need their own verification. No production/CMS/application writes were made by this audit.

Evidence: [2026-10-21-technical.json](measurements/2026-10-21-technical.json).

## What works

All **524 sitemap URLs returned HTTP 200**. Every URL supplied a title, meta description, exactly one H1 and a self-canonical. No robots/noindex/snippet restrictions or nonreciprocal hreflang references were found among the crawled sitemap pages. Robots allows crawling and advertises the sitemap. This establishes technical accessibility for the audit request, not actual indexing or access from a search engine's bot network.

All **438 articles (237 Danish, 201 English)** include parseable Article JSON-LD directly in server HTML, with matching declared locale and page URL, author name/URL, consistent publisher `https://www.aproposmagazine.com/#organization`, image and valid publication dates. No future datePublished or dateModified-before-datePublished was found. The 20 October baseline's overlapping article datePublished values are unchanged. This does not establish original publication-date provenance for the whole archive.

The script's eleven apparent headline mismatches are **HTML entities inside JSON strings**, not eleven different editorial headlines: decoded, all match H1. There are no malformed JSON-LD blocks in the sitemap crawl.

Language pairs were matched using actual hreflang targets, since English slugs often differ. **36 Danish articles have no English alternative**. They do not advertise a nonexistent translation, so absence alone is not an implementation error. The site may deliberately prioritize Danish publication.

## Prioritized fixes

| Priority | Finding and scope | Concrete next action / acceptance |
|---|---|---|
| P1 | Three English routes contain Danish editorial text: [Danielle Dahlhus](https://www.aproposmagazine.com/en/articles/danielle-dahlhus---det-ma-du-ikke-sige), [Kvinde ukendt](https://www.aproposmagazine.com/en/articles/kvinde-ukendt-er-danmarks-oscar-bud), [Street Fighter](https://www.aproposmagazine.com/en/articles/street-fighter-2026). The first two are body-hash-identical to Danish; Street Fighter was read directly and its metadata is also Danish. | Finish and editorially verify these translations and SEO fields, or keep an unfinished EN variant out of public language navigation/sitemap/hreflang. Acceptance must inspect actual content language, not just `lang=en` or field presence. |
| P1 | Street Fighter's dynamic Review schema changes the film to a **VideoGame** on EN and displays the **Game review** label. DA correctly emits Movie. Both carry 4/6. | Replace free-text type inference with explicit reviewed-work metadata/controlled taxonomy shared across locales. Verify Movie/TVSeries/Book/VideoGame plus unrated essays and concert reviews in browser regression fixtures. |
| P1 | Topic hero dates and Featured ordering use Webflow’s mutable Published On system field (verified in Designer); visible dates disagree with Article publication dates and changed after publishing. | Define whether each visible date means published or updated. Bind to the corresponding durable source, retain historical evidence and verify dates/order do not change on an unrelated staging publish. Do not manufacture historical dates. |
| P2 | [English About](https://www.aproposmagazine.com/en/om) retains the previous long profile/H1, while Danish has the new ad-free profile. | Translate the approved current profile and metadata, retaining layout and factual/legal information. |
| P2 | **41 article image elements across 13 URLs** lack non-empty alt (12 DA, one EN). Includes Street Fighter, Disclosure and Saveus. | Review informative versus decorative images; add relevant descriptive alt only where appropriate. Make image-preparation acceptance catch new omissions. Exact URLs/counts are in evidence finding T05. |
| P2 | Eleven JSON-LD headlines contain literal `&amp;`, `&#39;` or `&quot;`; related section/keyword/job-title strings also show HTML escaping. | Serialize plain text as JSON once, with script-safe escaping. Confirm parsed JSON string equals visible text for ampersands, quotes and apostrophes. |
| P2 | Both press pages, all six section pages and all 16 sitemap author pages lack page/profile schema. Home/About already identify the same publisher. | Add only truthful page/collection/profile identity and connect it to the existing publisher ID. This is an enhancement, not a missing universal SEO requirement. See author caution below. |
| P2 | [All streaming services](https://www.aproposmagazine.com/services/all) renders “All” as if it were a streaming brand. All seven service pages per locale share a generic H1. | Give the all-services hub an intentional title/description; bind each service heading to its actual service. Improve existing useful pages before adding more. |
| P3 | Two public Andreas Christensen author routes are referenced by articles/About and return 200, but are absent from sitemap. | Confirm exclusion is intentional; include if intended as public author landing pages. |
| P3 | `/search` and `/en/search` are sitemap-listed/indexable utility pages. A valid article URL still ends in `007-first-light-review-restore-tmp`. `llms.txt` links `/festival`, which correctly 301-redirects to `/tema`. | Decide utility-page index policy. Avoid cosmetic URL migrations without a real need and redirects. Refresh optional llms.txt links/profile text after core fixes. |

Google determines language from content rather than simply trusting hreflang or the HTML lang value; the three untranslated EN pages therefore need real content correction. [Google localization guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).

### Date examples observed in production

| Topic hero | Visible date | Article datePublished | Article dateModified |
|---|---|---|---|
| `/topics/film`: Street Fighter | Oct 20, 2026 | Oct 14, 2026 | Oct 16, 2026 |
| `/topics/koncerter`: Cæcilie Norby | Oct 20, 2026 | Oct 19, 2026 | Oct 19, 2026 |
| `/topics/kultur-mening`: Barsel | Oct 21, 2026 | Oct 20, 2026 | Oct 21, 2026 |

The card text is not labelled as an update date. The first two differ from both article dates. A subsequent read-only Designer inspection on 21 October verifies the binding: Topics Template (`67dbf17ba540975b5b21c213`), hero date Text Block (`21da636a-b814-9994-4fb8-84b2a66475c7`) → **Articles / Published On**. Featured articles (`67dbf17ba540975b5b21c218`), Collection List Wrapper 8 (`articles-list`) → **Published On, Newest to oldest**, 25 items per page. Both rely on the mutable Webflow system field; this explains the publish-dependent date/order changes documented in the prior release comparison. No settings were changed, and Undo/Redo remained disabled. Durable original-publication storage and evidence-based historical backfill are still needed; do not substitute event dates or guess older publication dates. Article `datePublished` means first publication; keep this distinction explicit. [Google Article schema](https://developers.google.com/search/docs/appearance/structured-data/article).

## Latest five articles

Selection uses declared Danish Article.datePublished rather than the editorially curated homepage order. All five pass the basic HTTP, indexability, title/description/H1/canonical and Article-field checks. “Pass” here does not mean editorial facts, SEO phrasing or search performance are perfect.

| Article | First-publication value | Further result |
|---|---|---|
| [Jeg gik på barsel og endte i en religiøs uldsekt](https://www.aproposmagazine.com/articles/jeg-gik-paa-barsel-og-endte-i-en-religioes-uldsekt) | 20 Oct 2026 | Specific meta about Bette Café and the essay. No Review emitted in browser. No published EN alternative. |
| [Cæcilie Norby på Gamle Scene](https://www.aproposmagazine.com/articles/caecilie-norby-gamle-scene-anmeldelse-2026) | 19 Oct 2026 | Concert rating appears in title/meta; browser uses concert label and does not retain a misleading album Review. No EN alternative. Topic date mismatch above. |
| [Street Fighter](https://www.aproposmagazine.com/articles/street-fighter-2026) | 14 Oct 2026 | DA Movie Review 4/6 is consistent. EN content and dynamic type are wrong as above. Three body images lack non-empty alt. |
| [The Whisper Man](https://www.aproposmagazine.com/articles/anmeldelse-the-whisper-man-netflix-2026) | 13 Oct 2026 | Specific title/meta; browser Movie Review 4/6. No EN alternative. |
| [Kontrapunkt](https://www.aproposmagazine.com/articles/kontrapunkt-kundearbejde-eller-kunst) | 12 Oct 2026 | Specific title/meta; no Review emitted for this culture feature. No EN alternative. |

## Server versus browser schema

Eight actual headless-Chromium production navigations were checked, with analytics/ad-tracking calls blocked but Webflow/editorial scripts allowed. Article is already in the HTTP response. Review is injected after DOMContentLoaded and then reclassified by a second inline pass.

Verified positive samples: English Untamed becomes **TVSeries, 4/6**; Sød Tøs becomes **Book, 6/6**, with **Anna Juul** as Book.author and Liv Brandt as the article reviewer. Cæcilie Norby retains Article and concert label; barsel and Kontrapunkt do not gain a Review. Street Fighter EN is the counterexample. JSON syntax validation alone misses it.

Prefer a single deterministic schema source over two heuristic passes. Rendering support is not evidence that a snippet will be shown. Markup should match the visible article and its actual reviewed subject. [Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

### Author/entity caution

The existing Article schema already types **Liv Brandt as Person on 110 article URLs**. Because Liv is an AI editorial persona in the project, do not expand that into invented human credentials or a physical-person biography. Resolve the attribution model explicitly, preserving byline, accountable publisher/editor and internal provenance. For actual human authors, a truthful ProfilePage/Person identity can consolidate existing visible author information. Person markup is not a requirement for every author page to be discoverable.

## Measurement and scope limits

- No Search Console index-coverage/URL-inspection, ranking, CTR or independent AI-answer citation evidence was established by this crawl.
- Real bot-IP access, Core Web Vitals field performance and full editorial fact/rights review remain separate checks.
- Root's Webflow AEO analytics checks returned **403 entitlement required** for bot-traffic/prompt analytics. Record **unavailable**, never zero traffic; no purchase or quota retry was made.
- The existing GA4/citation measurement plan remains the appropriate baseline. Schema validity and llms.txt presence must not be presented as measured AI visibility.
- Google states that ordinary SEO applies to its AI features and no special AI file or schema is required. Prioritize clear original content, usable internal links and faithful structured data. [Google AI-feature guidance](https://developers.google.com/search/docs/appearance/ai-features).

## Delivery order

1. Correct the three live EN variants and dynamic reviewed-work typing, with exact before/after browser evidence.
2. Settle durable date semantics/bindings and verify stability across publication.
3. Complete the approved English profile and truthful shared entity/page identity.
4. Repair the reviewed image-alt gaps and JSON text escaping; make these publication acceptance checks.
5. Polish existing streaming/search/author discovery and optional llms.txt links.
6. Measure indexing, search performance and independent citations before claiming uplift. Do not trigger a mass metadata rewrite simply because the technical fields are populated.
