# Automatic Google-driven metadata reviews

Requested outcome: scheduled GSC/GA4 opportunities can lead to verified metadata changes without a manual optimization click. Existing publication-quality review remains unchanged.

## Implementation and acceptance

- Daily and weekly opportunity crons collect analytics and enqueue eligible performance reviews. Versioned cron slots allow the first automatic run after the former collection-only slot; queue admission deduplicates across scans.
- Atomic Firestore admission permits at most two new automatic performance reviews per Copenhagen day, and one unfinished automatic performance job per article/locale. Existing AI budget/provider controls still apply; this is not a budget increase.
- Require complete, non-overlapping comparable periods of at least 14 days and 200 impressions in each period. Evidence expires after three days, checked before AI and again before changes.
- Preserve editorial locks, staged drafts, current-metadata comparison, 28-day change cooldown, independent candidate verification, duplicate checks, CMS leases and public HTML readback. Completed performance assessments also get a 28-day review cooldown, including kept/needs-editor outcomes.
- Existing queue workers prioritize admitted performance work along with publication reviews. Only the title/meta fields can change; no body, visual design, rating, slug or media changes.
- Cron responses distinguish queued from applied. Admission receipts: `seoPerformanceAdmissions`; outcomes/public receipts: `seoPostPublishJobs`. The cron completion detail records queued identities.
- Recovery archive admission remains restricted to one recent review/day. Historical automatic performance jobs without the new admission receipt remain blocked. Existing paid-stage and pending-write records are preserved.

## Verification

115 focused tests passed across 18 files, including concurrent queue admission, evidence freshness, locks/cooldown, per-article deduplication, queue priority, manual scan compatibility, provider/budget denials, model durability and simulated verified CMS completion. Type-check and production build passed.

Production verification is recorded separately after deployment. At implementation time the existing OpenAI quota hold was active (revision 5, since 2026-09-30). Do not clear it or make a paid probe without evidence that billing has been resolved. A successful deployment/queue receipt is not proof of a completed live AI review or improved search performance.

Acceptance still dependent on provider availability: actual automatic review → independent verification → metadata-only CMS update → public readback. Once billing is resolved and the existing provider hold is explicitly resumed, the scheduled recovery worker processes fresh eligible jobs; stale analytics are discarded and a later scan supplies fresh evidence. Do not reset saved paid stages, budgets or audit history.
