# Validator notes (v1.1)

Server-side validator afviser/advarer om:
- Forbidden phrases / stuffing
- Spoiler-amplifikation uden markering
- Unsupported invented claims
- Længdeproblemer på seoTitle/metaDescription
- Manglende primary phrase
- **Review-title keyword (hard error `review_title_keyword_missing`)**: for review-typerne Filmanmeldelse / Serieanmeldelse / Koncertanmeldelse / Festivalanmeldelse / Albumanmeldelse / Spilanmeldelse / Teateranmeldelse / Kunstanmeldelse skal seoTitle indeholde `anmeldelse|anmeldelser` (DA) eller `review|reviews` (EN) med ordgrænse. Auto/backfill blokerer — ingen suffix-truncation der fjerner ordet.

AI skal foregribe disse i `warnings`/`risks`/`checklist`.
