# Liv: film reviews and CMS topics

User correction, 12 September 2026: coverage assessing a particular current film
or TV series should be a review, not an unsolicited cultural feature. A review
needs an argued verdict, documented strengths and weaknesses, and 1–6 reasoned
stars. Explicit features, interviews, news and cultural analyses remain distinct.
Do not manufacture attendance, scenes, sources or a rating. Do not relabel a paid
feature retroactively or rerun paid writing merely to change its format.

## Observed production state

Read both staged and live Danish Webflow versions through the authenticated API:

- Article: “Alle Guds farver: Et fællesskab er først rummeligt, når det forandrer sig”.
- Item: `6aa51107feea4b5112862f09`; locale: `67dbf17ba540975b5b21c225`.
- `lastPublished`: `2026-09-12T10:16:34.349Z`, `isDraft: false`.
- Primary Topic (`topic`): Kultur & Mening, `67dbf17ba540975b5b21c301`.
- Topics (`topics`): Kultur & Mening and Film (`67dbf17ba540975b5b21c303`).
- Rating (`stjerne`): null, consistent with the existing feature, but not the
  review the user expected. No CMS write was needed to fill missing fields:
  both fields were already present in both versions at inspection.

The actual schema defines `topic` as Reference and `topics` as MultiReference,
both to collection `67dbf17ba540975b5b21c2af`. Neither is schema-required; an
editorial completeness check therefore cannot rely on `isRequired` alone.

## Root cause and intended correction

The old automatic daily plan explicitly requested a “kulturfeature”, set
`articleFormat: article`, and prohibited review stars. The writer followed that
brief. Future fresh automatic selection must choose format after the concrete
topic is known and before review research and writing. Explicit editorial choices
and saved work retain their original format.

Use existing CMS taxonomy, not AI-invented tag names: Film or TV-serier as the
primary topic for screen reviews, plus Anmeldelser in Topics. Resolve topic
references with one collection listing per save, without paid AI classification.
Verify stored reference fields instead of silently accepting an empty mapping.

This is a prompt/routing and CMS correctness update, not model fine-tuning.
Instagram, the daily schedule, existing article text/images and publication
history are outside the mutation scope of this correction.

## Verification before release

- Full isolated test run: 2,010 tests in 132 files passed.
- TypeScript and scoped ESLint passed; no dependency changes.
- Regression fixtures cover automatic format selection before research,
  immutable saved writer format, explicit features, Film/TV-serier + Anmeldelser,
  one topic-collection fetch for several tags, and missing/wrong CMS references.
- Live taxonomy listing returned HTTP 200: seven Danish, non-archived,
  non-draft topics. No paid generation or CMS mutation was used for verification.
