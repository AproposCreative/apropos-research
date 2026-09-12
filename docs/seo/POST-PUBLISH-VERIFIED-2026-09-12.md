# Automatic post-publication SEO — verified delivery

Production code: `86a7418739bb44c211044eafe98ae9d474326e7b`.
Deployment: `dpl_2FGFSGYsdQTwVJNCRKEUNabG4KLu`, READY and authoritative
production target; authenticated UI displays BUILD 1.0.0.86a7418.
This receipt supersedes unfinished status in earlier delivery checkpoints.

## Delivered acceptance criteria

1. Both filled and empty metadata fields receive article-grounded AI review and
   independent candidate verification. Paid model results persist by job/stage;
   uncertain requests do not automatically regenerate.
2. Durable, transactionally deduplicated jobs, worker leases, retries, editorial
   locks, content versions, audit history and 28-day rewrite cooldown are active.
3. Shared app publish hook plus authenticated Webflow publication webhook feed
   the queue. Paginated live-item discovery catches missed events and articles
   without Google impressions. DA/EN are scoped separately; drafts are excluded.
4. Only title/description metadata is patched live. Staged differences, concurrent
   changes and locks stop writing. CMS and public HTML must both verify before
   success. Uncertain writes are reconciled without repeating the mutation.
5. Daily GSC/GA4 collection and weekly performance review use the same queue and
   safeguards. Equal complete observation periods and minimum sample sizes are
   required. Missing analytics remain unknown. Rankings are not attributed to a
   metadata change without evidence.
6. Live-locale uniqueness checks, before/after history, reasons, evidence,
   verification state and field locks are available in SEO → Optimering.
7. 509 SEO + Liv/CMS regression tests passed on freshly installed locked
   dependencies with lifecycle scripts disabled; build and final typecheck passed.
   Actual component browser checks passed at 390px and 1280px. Production UI and
   API authentication were independently checked. Other editorial/UI design is
   not changed; Instagram remains off.
8. Liv production commit 17e0c6f is included. Release was coordinated with Liv;
   no force push or overwrite. Production credentials/connections, schedules,
   webhook authentication and a real automatic metadata update were verified.

## Runtime evidence

- Headline Flip job `6782bdc9ea94d85461975b4aad671a2ed1a741c48d5dabe6c2a2d4cd33020752`
  automatically updated existing metadata. Re-read 2026-09-12T21:04:13.063Z:
  exact CMS/public HTML match, editorial content hash unchanged, duplicate worker
  claim blocked. Public URL:
  https://www.aproposmagazine.com/articles/headline-flip-vender-plakaten-kan-det-vende-publikum
- SEO title before: “Headline Flip vender koncertens hierarki”. After:
  “Headline Flip vender koncertprogrammet i Pumpehuset”.
- Alle Guds farver and The Invite were reviewed but proposals did not pass both
  model assessments: needs_editor, original metadata retained. A concurrently
  changed article was marked stale. These outcomes are not successful rewrites.
- Fresh real Google scan: status ok, both GSC/GA4 configured, complete equal
  periods 2026-08-13–09-09 and 2026-07-16–08-12; 10 opportunities evaluated,
  four quality jobs queued. Insufficient-evidence/already-applied cases skipped.
- Production recovery returned 200 authenticated; unauthenticated quality API,
  internal worker and recovery returned 401. Production schedules: recovery every
  15 minutes, daily collection 06:15 UTC, weekly review Monday 06:30 UTC.
- During diagnostics a webhook URL query credential was inadvertently emitted.
  The diagnostic now strips query strings; a new random secret was securely
  installed. Final verification 2026-09-12T21:06:34.314Z: new credential 200,
  old credential 401, old registration removed, unrelated webhook preserved.
  No credential values are stored in this receipt or committed files.

## Operational limits

The setup is live; archive processing continues through its bounded queue. A queue
entry is not a completed optimization. Editorial disagreement or uncertainty is
visible and does not trigger forced rewrites. Traffic improvements require future
observation; Google may choose different displayed titles/snippets. No ranking
increase or complete historical-archive cleanup is claimed by this receipt.
