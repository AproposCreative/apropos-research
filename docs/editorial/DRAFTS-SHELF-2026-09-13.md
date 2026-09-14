# Mine artikler: private workspace entry points

**Historical release receipt.** Current acceptance is tracked at the top of
PERSONAL-WORKSPACES-2026-09-13.md. New shared-copy creation has since been
retired, alert history now returns 200 for the owner, and file-tracing warnings
were resolved. The old index-permission blocker below is obsolete. Real
multi-device Writer acceptance remains open; isolated component tests are not
evidence of human team use.

Released through `dc79e1e5186636c9f72d15fff4a79eadba65b4da` to production. Deployment `dpl_V18NMN37xkJ1o5f4WfHpFcdTrTVD` is READY with `ai.aproposmagazine.com` alias. Earlier local checkpoints below are historical.

- Desktop and mobile shelves link to existing saved-version and shared-copy dialogs. No additional storage or paid API workflow.
- Shelf subtree is keyed by authenticated UID. Old list responses are ignored on cleanup; late rename callbacks cannot reach a new account.
- Failed reads have an explicit retry rather than appearing as an empty shelf.
- Firestore document identity overrides stale embedded IDs. Drafts without messages have an empty array.
- Renaming another draft no longer changes the currently open article title.

Verification: two targeted data tests, TypeScript check, build-configuration safety check and diff whitespace check passed. Actual browser account-switch and mobile interaction verification, production build and deployment remain pending. This is not production acceptance evidence.

## Browser checkpoint

The real DraftsShelf component was rendered with isolated auth and data in `scripts/verify-drafts-shelf-ui.mjs`. At 390×844: no horizontal overflow; held account A responses released after switching to B did not replace B's list; opening B called `open:draft-b`; version/share buttons called the intended callbacks. Simulated read failure showed retry, and retry restored the list. Logout removed all shelf content. No browser errors or unhandled rejections. Screenshot inspected at `/tmp/drafts-shelf-mobile.png`. Browser and fixture server closed afterwards.

This verifies the component and callbacks, not a real multi-device Firebase session or the full Writer restoration flow. Production build/deployment verification follows separately.

## Release result

- Build and TypeScript passed; nine existing file-tracing warnings remain. Full isolated suite: 3,339 tests in 227 files passed.
- Production authenticated reads: access, workspace, versions, shares, media sources, tips, feed and operations all 200. Private data APIs returned `private, no-store`.
- Feed reported preparation/queue enabled and three stories. This is not proof of a new article publication.
- Anonymous workspace, shares, sources, tips, operations and alert-history reads returned 401.
- Overall smoke check intentionally failed: alert history still returns 503 because its required index is not installed. Do not label the entire release acceptance green.
- Smoke verifier now accumulates failures and checks anonymous access even if an earlier endpoint fails. It still exits unsuccessfully when any check fails.
- Full multi-device Writer restore and real colleague access verification remain open. No paid AI call, article mutation or email was made in these checks.

Separate unresolved dependency: production alert-history index creation needs Cloud administrator permission, as recorded in OPERATIONS-RELEASE-2026-09-13.md. Other flows are not proven broken by that missing history index.
