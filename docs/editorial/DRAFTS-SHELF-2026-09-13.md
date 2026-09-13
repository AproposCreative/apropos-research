# Mine artikler: private workspace entry points

Implemented locally, not yet deployed.

- Desktop and mobile shelves link to existing saved-version and shared-copy dialogs. No additional storage or paid API workflow.
- Shelf subtree is keyed by authenticated UID. Old list responses are ignored on cleanup; late rename callbacks cannot reach a new account.
- Failed reads have an explicit retry rather than appearing as an empty shelf.
- Firestore document identity overrides stale embedded IDs. Drafts without messages have an empty array.
- Renaming another draft no longer changes the currently open article title.

Verification: two targeted data tests, TypeScript check, build-configuration safety check and diff whitespace check passed. Actual browser account-switch and mobile interaction verification, production build and deployment remain pending. This is not production acceptance evidence.

Separate unresolved dependency: production alert-history index creation needs Cloud administrator permission, as recorded in OPERATIONS-RELEASE-2026-09-13.md. Other flows are not proven broken by that missing history index.
