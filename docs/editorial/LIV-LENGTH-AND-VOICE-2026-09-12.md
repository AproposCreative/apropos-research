# Liv: historical lengths and author voice

## Evidence and scope

Read 210 live Danish CMS articles through the supported Webflow API (three pages, complete pagination). Snapshot and content hashes: `liv-length-baseline-2026-09-12.json`; calculation: `scripts/analyze-liv-length-baseline.ts`. Count uses `countLivBodyWords`: Unicode words in body prose, excluding headings, figures/captions, scripts and embedded media. Intro is a separate CMS field and excluded.

Exclude the four recent Liv pilots (The Invite, Thirst Trap, Headline Flip, Alle Guds farver) from calibration so their disputed lengths do not set their own benchmark. 206 nonempty unique articles remain. These are current live versions, not an immutable first-publication archive. `lastPublished` is affected by republication and is not used as a first-publication date.

| Group | Count | Median words | Middle 50% |
|---|---:|---:|---:|
| All eligible articles | 206 | 656.5 | 447.25–870.75 |
| Review proxy: stars or Anmeldelser topic | 176 | 671.5 | 455–871.5 |
| Film/TV subset of review proxy | 49 | 730 | 389–930 |
| Other formats | 30 | 593 | 447–848 |

Webflow has no explicit article-format field. Review classification is a proxy, not manually verified genre truth. The remaining 30 include essays, guides and event coverage; they cannot honestly be called 30 features. Long guides (up to 2,734 words) are legitimate outliers, not a daily target. The new ranges below are editorial choices informed by this distribution and the user's request for concise writing, not claims about engagement-optimal length.

## Defaults for new work

| Selected Writer format | Before | New body-word interval | Target |
|---|---|---|---:|
| Short news | 450–650 | 300–500 | 400 |
| Review | 800–1100 | 500–850 | 675 |
| Feature | 1100–1400 | 600–900 | 750 |
| Analysis | 900–1200 | 600–900 | 750 |
| Commentary/essay | 1000–1300 | 450–750 | 600 |
| Explicit longread | 1400–1800 | unchanged | 1600 |

The selected Writer format remains authoritative. Unknown format no longer defaults to a long feature. Daily Liv keeps its already-versioned **450–650 / target 550** policy and existing checkpoints. It is a deliberately concise daily edition, not a claim that every historical review was that short. No paid article is regenerated to change a policy. Writer uses the same body-prose counter as Liv. Analysis and supported detail should survive shortening; repetitions and plot summary should not.

## Voice reconciliation

Verified author: `67dbf17ba540975b5b21c31c`, slug `liv-brandt`, Danish locale. Actual CMS voice field is RichText **author-prompt**. Live CMS initially contained **v.01**, whereas Writer and daily generation shared local **v4**. The old CMS voice's warm, sensory, feminist, literary core is already retained in v4; later user instructions add reasoned interpretation, originality, headline personality and factual constraints. Replacing v4 wholesale with v.01 would regress these requirements.

The old raw HTML is preserved in the baseline snapshot for recovery. `scripts/sync-liv-author-voice.ts` provides an explicit one-time canonical→CMS mirror with identity checks, expected-source hash, field-only PATCH and readback. It does not publish an article, touch other authors, invoke AI or claim model fine-tuning. This is a synchronization of the current approved profile, **not automatic ingestion of future CMS edits**. Future voice edits still require reconciliation with the canonical runtime profile; this limitation is intentionally not hidden behind a claim of continuous synchronization.

No article publication, Instagram change or extra research/generation is required for this calibration. Release and live checks are recorded separately once executed.

## Executed CMS synchronization

API PATCH and subsequent GET succeeded on 2026-09-12. Only Liv's `author-prompt` was changed; every other author field was compared and preserved. Canonical text SHA-256: `aa9d0dae3b1e811d0c85b0788c5be31c78a2b1f8c28bbf2376c6601c178e0b41`. Previous raw CMS hash: `be1f088377f692d6f216b0a485f6f49b5295fa584f35887f8a4d89480db68b66`. New raw CMS HTML hash: `f0ca3c020d9a63945d1d2e3b4c32a10c9927548c98eb2bd108f78053102be9da`. Normalized CMS text equals the canonical runtime text. Original prompt is retained in the snapshot.

Scope limitation: the separate legacy editorial-desk preflight retains its 75–130% target tolerance, the legacy preview retains its own 1,000-word target, and legacy moderation still has a 500-word metric floor. This change calibrates Writer's selected formats and preserves the existing strict daily-length contract; it does not certify every legacy entry point as one unified pipeline.

## Verification before release

- 2,445 tests passed across 140 files with isolated test storage.
- TypeScript passed. Scoped runtime/test lint passed; helper-script lint was run explicitly with `--no-ignore`.
- Regression cases cover all six formats, unknown-type fallback, explicit template precedence, caption/heading exclusion, unchanged daily policy, author field aliases, pagination and locale handling, CMS mirror identity/hash/readback and other-field preservation.
- Writer research and system-prompt exclusions agree with the shared counter. An explicit 400-word generation target is no longer clamped to 450.
- All model responses in tests are fixtures. No paid research, writing, image generation or article regeneration was invoked for these changes.
