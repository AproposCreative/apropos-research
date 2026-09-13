# Shared budget ownership release, 2026-09-13

- Commit: cb4e46564b29bddf24c2b9ea50f8c62443651e3b
- Non-force push completed; remote branch SHA matched.
- Isolated regression: 3,113 tests in 193 files passed; TypeScript passed.
- Production deployment: dpl_HL6SpQjhuGm5uWbi6SNH4cKkh7k1
- URL: apropos-research-pxyk4xtxp-frederik-kraghs-projects.vercel.app
- Last observed deployment state: READY. Project production target and exact SHA
  both matched this deployment.

At 2026-09-13T15:50:38.821Z authenticated operations returned 200/private-no-store;
anonymous access returned 401. Liv reported autoPublishEnabled true, today's
publication true, overdue false, missingDays/blockedItems empty and no pending
reconciliation. Recorded public URL:
https://www.aproposmagazine.com/articles/the-gentlemen-saeson-2-goer-privilegium-til-et-vaben

Newsletter 2026-W37 is enabled with a sent record (14 sent, 0 failed), not proof
of inbox delivery. Budget section is available, fullMonthlyCapVerified false.
No runtime error/drain scan or visual UI verification was performed for this release.

Changes: when shared accounting is enabled, unowned OpenAI requests fail before
transport; manual Liv preview and media revisions receive server-owned contexts.
Prompt inspection no longer performs paid research. Directive expansion uses
accounting and its existing cache. Editorial discovery skips unnecessary fallback
searches. Existing saved work and publication safeguards are preserved.

No paid production generation, CMS write or newsletter send was used for testing.
Full invoice coverage, standalone generated-image checkpointing, visual role tests
and seven consecutive publication days remain separate unfinished goal items.
