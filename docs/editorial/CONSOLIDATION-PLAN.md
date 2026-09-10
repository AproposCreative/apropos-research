# Liv / Writer consolidation

Started 2026-09-10. Initial implementation was local only. The user subsequently
authorized push, deploy and latest-article publication without further approvals.
Existing work is preserved; no new dependencies or local secrets are required.

## Target

One article lifecycle, used by Writer and Liv:
idea → research → editorial angle → draft → media / checks → CMS staging →
verified live. Requested publication is not evidence of publication.

## Execution order and acceptance criteria

1. **Shared CMS save boundary** (implemented and locally tested).
   Reuse `lib/articles/publish.ts` for normalization, staging, identity readback
   and explicit save receipts. Both routes consume the same result. Preserve
   known IDs on failure; do not blindly repeat creation. Keep live gates intact.
2. **Format-aware research** (implemented for Liv's two existing formats).
   Ordinary articles must not automatically search for competitor reviews.
   Explicit research reviews may do so. Preserve subject names and the same
   bounded number of search requests; test without model/network access.
3. **Durable article lifecycle and recovery** (checkpoint implemented; migration pending).
   Before migration, inventory desk, daily, Writer and inbox records and ownership.
   Select one canonical record with stable article ID, revision and run ID;
   migrate consumers without deleting old records. Persist checkpoints before
   external writes, with leases and reconciliation after uncertain writes.
   Test concurrent claims, crashes and retries against a local adapter/emulator.
4. **Shared media contract** (pending).
   One hero plus at least two distinct body images; source metadata, captions,
   alt text, aspect ratio and byte limits. Reuse existing image helpers. Test
   actual HTML and bytes, not only presence of image URLs.
5. **UI and obsolete module cleanup** (shared storage moved; UI cleanup pending).
   Extract responsibilities from large Writer/Liv components. Move shared file
   storage out of Funding before removing obsolete Funding-specific references.
   No rewrite of SEO, newsletters, accreditation or podcast.
6. **Release verification** (authorized; CMS connector restricted).
   Local suite + type check first. Verify
   deployed SHA and run an article end to end, including CMS and public-page
   readback. Then verify repeat execution creates no duplicate. Instagram stays
   off. Do not activate auto-publish based on a passing mocked test suite.

## Completion evidence

Record tests and remaining gaps below as work progresses. No model fine-tuning,
new service split or new UI feature is required for this consolidation.

### First local implementation, 2026-09-10

- Writer's save route and Liv's daily cron consume the checked shared save
  result. Staging cannot report a verified publication, even if requested.
  Errors retain a known item ID, including an uncertain update response. A
  different returned ID cannot silently replace an existing update target.
- Liv checkpoints its CMS ID before readback and optional SEO work. A stale
  daily run with that ID cannot be reclaimed for blind article recreation.
  This is NOT exactly-once publication: a crash between the external write and
  the checkpoint still requires reconciliation. Automatic resumption, leases
  across all stages and canonical story migration remain outstanding.
- Non-review Liv articles seek interviews/background/intention/context rather
  than automatically adding review queries. The explicit research-review format
  retains review search. Both keep two search requests. Writer's wider template
  taxonomy has not yet been migrated into this two-format distinction.
- Shared JSON storage moved from `lib/funding/json-store.ts` to
  `lib/storage/json-store.ts`; all 15 production imports plus the test import
  were migrated. It now honors `RAGE_STORAGE_DIR`, rejects path traversal and
  refuses fallback to tracked data when Vitest isolation is absent. No user
  data was deleted or migrated. Other Funding-specific remnants remain.
- Full local suite: **891 tests / 88 files passed**, 16:47 Copenhagen.
- `tsc --noEmit --incremental false` passed; `git diff --check` passed.
- Existing dirty files preserved; tracked research datasets unchanged. No
  dependencies installed, secrets accessed, live API tests, push or deploy.

### Next implementation boundary

Map existing records before adding a new store:
`editorialDesks/{uid}/stories` (per-user desk), `livDailyArticles` (server cron),
`livSourceArchives` (scoped research), Writer browser history and Liv inbox
storage. Preserve access scopes and stable Webflow IDs. Do not merge user desks
into the server cron namespace merely because their topics or slugs match.
Then integrate shared media validation and verified live publication, with
failure/recovery tests spanning the real local orchestration and mocked service
boundaries. Production acceptance is still separate. Passing local tests does not establish editorial quality or live
auto-publish readiness.
