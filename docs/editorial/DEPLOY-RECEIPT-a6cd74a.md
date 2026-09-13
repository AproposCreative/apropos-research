# Production receipt a6cd74a

- READY deployment `dpl_6hZnq78t261XcQ93sT8pPbUQttWQ`.
- Exact production target readback: `a6cd74a4284243f097425ccab46c585d5f3161fd`.
- Regression: 3,162 tests in 199 files passed; previous targeted TypeScript check passed.
- Authenticated read-only `/api/liv/status?includeCms=0` at
  2026-09-13T17:14:53.644Z: HTTP 200, private/no-store, two history entries,
  corrected Copenhagen 10:00 schedule note present.
- CMS publication classification (draft without lastPublished, archived status)
  tested with fixtures, not by mutating production CMS articles.
- No paid AI generation or publication invoked in this release verification.

This proves the release and status readback, not seven automatic publication
days or a reconciled provider invoice. Those goal requirements remain open.
