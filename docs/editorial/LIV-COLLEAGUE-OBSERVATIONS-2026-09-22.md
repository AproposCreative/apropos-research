# Colleague observations: 2026-09-22

## Delivered scope

Liv's existing upcoming feed includes a collapsed, mobile-friendly self-attestation form. Verified Frederik, Casper and Milo can confirm their own specific experience against an exact saved pre-CMS article version. Identity is derived from Firebase, never the submitted form.

The form records event/viewing scope, date, exact attributed article excerpt, concrete observation and explicit editorial sharing consent. One immutable receipt per colleague/version; repeated identical requests return the existing receipt. Notes do not rewrite text, publish, reset retries or buy AI work.

The normal server workflow resolves saved evidence before its existing combined editorial assessment. Evidence is explicitly internal self-attestation, not independent verification of attendance. It can support only the exact attributed excerpt, cannot replace the required dated public sources, and cannot bypass quality or publication gates. Context hashes invalidate stale assessments. No additional model call was introduced.

## Boundaries

- Only saved work before CMS handoff is eligible; already-ready CMS drafts are unchanged.
- Raw notes are not automatically inserted into an article. Writer's existing colleague-note input remains the drafting path.
- Only the authenticated colleague can submit their own confirmation. Liv does not inherit their first-person attendance.
- The list is bounded to yesterday/today/tomorrow preparation and reserve runs.
- This release does not introduce a manual publication fallback or reset terminal runs.
- No fabricated production attestation or paid generation was used for verification. A real colleague-submitted observation through a subsequent publication remains an operational pilot, not a claimed completed test.

## Verification before release

4,073 tests across 295 files passed. Type-check, scoped ESLint and diff checks passed. Regression covers authentication, isolation, required consent, idempotency, changed versions, exact citation scope, immutable receipts, evidence tampering and fail-closed assessment context.

The real component was tested in an isolated installed Chrome at 390px with mocked APIs and existing app CSS: no initial fetch, no horizontal overflow, required consent, conflict preserves entered notes, duplicate submission suppressed, no browser errors. This is component-level mobile verification, not a complete live publication test.

## Production receipt

- Code SHA: `6d7df81322743ab93b9c1404f0df43f5fea2b43e`.
- Deployment: `dpl_5yjBGcEuPurW1n37M7Ydso4v5BBE`, READY; production target SHA matches; `ai.aproposmagazine.com` alias confirmed.
- Anonymous GET: 401.
- Verified Frederik, Casper and Milo: GET 200, private/no-store; invalid empty POST 400, before mutation.
- Eligible pre-CMS stories at verification: 0 for each user. This is not a claim that the publication queue is empty; ready CMS drafts are intentionally excluded.
- No production attestations created, no AI requests or CMS writes made by this verification.
