# Import and thumbnail release, 2026-09-13

- Commit: 4590fccdb1d520375fbb13839ec7fe29219b60b8
- Non-force push succeeded; remote branch SHA matched.
- Full isolated regression: 3,103 tests in 190 files passed. No paid model calls.
- Production deployment: dpl_E1imFesPS1Gb7tBNZL5xBGr3FphR
- Deployment URL: apropos-research-jhmdhri8j-frederik-kraghs-projects.vercel.app
- Last authoritative state: READY, exact SHA and project production target matched.

At 2026-09-13T15:30:30.245Z authenticated operations returned 200, private/no-store.
Anonymous operations returned 401. Authenticated oversized article import
returned 400 before any model work or image uploads (the URL fixtures were never
fetched). Credentials were held in memory, never printed.

- Liv: autoPublishEnabled true, day 2026-09-13 published true, overdue false,
  blockedItems/missingDays empty and needsReconciliation false.
- Recorded article: https://www.aproposmagazine.com/articles/the-gentlemen-saeson-2-goer-privilegium-til-et-vaben
- Newsletter weekly record: enabled, 2026-W37, sent 14 / failed 0. Stored send
  evidence only, not recipient inbox confirmation. No message was sent here.
- Budget available, limit 300 DKK, fullMonthlyCapVerified false.

No paid production image smoke test was performed. Image behavior is covered by
mocked regression tests, not a claim of new production image generation. Runtime
error/drain scan and visual verification remain unrecorded.

Changes: bounded shared-budget article import with explicit oversize/truncation
failure; legacy thumbnail delegates to shared image workflow, retaining its
success envelope. Existing drafts and CMS items were not modified by verification.
Full shared-budget coverage and seven-day publication verification remain open.
