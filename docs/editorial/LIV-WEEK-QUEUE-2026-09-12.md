# Liv: three-story queue, 12 September 2026

User requested three upcoming stories after voice/length calibration: one review,
one feature and one cultural-history article. This is a finite prepared batch,
not a permanent three-article generation target. Instagram remains off.

## Releases

- `b4af4aa4dcee48f52db259b4e4406f2998ee2cd3`: show up to three saved ready
  stories; add bounded authenticated continuation and pre-media copy editing for
  existing scheduled preparations. Automatic next-day production target stays one.
- `3bc6234c776c11a25689a70c6588061f8379cbcc`: fix overly broad rejection of
  public 192.0.x.x sources; recover omitted server-plan seeds without another
  search or article rewrite. Add sanitized durable media-stage diagnostics.
- `78e4f6a36258f5614948dc3fb264d11d4c10fd99`: replace rounded image-price hold
  with an explicit 8192-output-token operational allowance, not a provider cap;
  retain actual-usage settlement and the 300 DKK monthly policy. Add a narrow,
  authenticated, hash-bound reconciliation operation with immutable receipt audit.
- `fc76f970fa199a19156b13ad888d33f89f523e15`: freshly retrieved exact undated
  evidence may support concrete facts, but never counts toward the two dated
  cited hosts required overall. Failed old-policy reports cannot be reused as
  new-policy results; prior successful stricter checks remain valid.
- `eaeac4a84e66677a0676b061af9819147a5a0499`: bounded operator copyedit of a
  failed scheduled pre-CMS article, preserving completed image and fact revision
  lineage. One durable visual-only review of existing bytes is required before
  normal factual/CMS checks. Truncated feed excerpts now end at a sentence where
  possible; future generation shares that deterministic helper, with no AI call.
- Latest local verification: 2,699 tests / 144 files; typecheck, scoped lint and
  diff check passed. Production readiness must be confirmed separately below.

## Failure evidence and preservation

The Freud feature's three image responses were HTTP 200 and all originals and
encoded publication assets were durably saved. Their reported output usage was
6,544–6,630 tokens, exceeding the old rounded $0.20 output allowance. The ledger
recorded those costs and blocked subsequent calls. Sanitized visual-review
diagnostics exposed `liv_cost_ledger_requires_reconciliation` as the cause.

Before reconciliation: 49 tracked calls, estimated 17.254488 DKK, zero reserved
cost and zero unknown calls. These are Liv-context usage estimates, not the
account invoice. Reconciliation may only lift this proved legacy allowance block
after all saved calls/receipts and month totals match. No usage, old breach status,
article text, generated image, CMS identity or audit record is erased.

Official reference: https://developers.openai.com/api/docs/guides/image-generation
and https://developers.openai.com/api/docs/models/gpt-image-1.5. Published image
prices are not treated as provider-enforced upper bounds.

## Completed batch

| Type | Title | Run | Final body words |
| --- | --- | --- | --- |
| TV review | The Gentlemen sæson 2 gør privilegium til et våben | reserve-editorial-2026-09-12 | 547 |
| Feature | Kroppen skylder os ikke at være flatterende | prepare-2026-09-14 | 572 |
| Cultural history | Frankensteins værste monster er ansvarsfralæggelsen | prepare-2026-09-15 | 560 |

The existing TV review is reused with its saved four-of-six rating and official
Netflix imagery. The other two articles use editorial illustrations and no stars.
Feature/culture start from new paid text only because their previous failed runs
had no saved article/CMS; old run/plan history remains in the audited retry flow.

## Completion evidence

Production `78e4f6a36258f5614948dc3fb264d11d4c10fd99` was verified READY as
`dpl_AshAx7Qh11oLb5KSHbvbZedN8zxn`, including ai.aproposmagazine.com.
Authenticated `/api/liv/operations/cost-reconcile` verified all 49 receipts and
lifted only the proved legacy image allowance block. Audit request:
`liv-week-image-allowance-20260912-v1`; ledger hash:
`a29c33b4eecb258ff6f9554971142f3cd83da87a2826308aedbc6a39d1854e05`.
The amount stayed 17.254488 DKK and original records were not rewritten.

Both new articles subsequently reached `media_prepared` with three assets each.
Freud's bounded factual revision changed its body to 572 words. Its next check
rejected two facts explicitly supported by the freshly retrieved Louisiana page
solely because that page has no publication date. The source-date correction must
retain two dated cited hosts overall while allowing exact undated supporting
evidence; previous failed reports must not be silently reused across this change.

Production `fc76f970fa199a19156b13ad888d33f89f523e15` was verified READY as
`dpl_CFFJR9Lseu1EH524WLdbL3TJnFNL`, including the production alias.
Final code release `eaeac4a84e66677a0676b061af9819147a5a0499` was verified READY
as `dpl_CSHN16yinEAqFVsnfCR9SjceSmzr` with ai.aproposmagazine.com attached.
Freud then passed all 13 factual claims with new actual verification, not a
relabeled failed report. CMS readback confirmed 572 words, no stars, hero and two
body illustrations, topic fields and exact payload proof. Item:
`6aa566cf1d63c39af0d73ad2`; proof hash:
`d8ae6d15750d1a6a26741562ab092c520dc1b182c129437b57aa7633e1fb1643`.

The reused TV review also passed fresh CMS readback. Item:
`6aa54ddfd3c29b324372d24b`; proof hash:
`2c3bc79ff4c16914d417b23d8903bcbf097afb72bdbae3ffb1b94b174b1ec94d`.

Authenticated feed returned both cards ready and both preparation/queue enabled.
All nine authors loaded successfully and Liv matched the canonical voice hash
`8e43899b56d07205e4d67c2ca3e6d42d8a0199e7f65bcb6bf4ae9915affb1690`.

Read-only delivery state confirmed Sept 12 published, no Sept 13 slot or daily
run, no cover hold and no ambiguous publication. Gentlemen was the only eligible
Sept 13 entry, expiring Sept 17. The old Sept 13 *preparation* failure does not
block delivery of that reserve. Code simulation plus 89 delivery-policy tests
confirmed next-day prepared stock is reused and daily publication is fenced
against duplicates. Production scheduling remains 10:00 Copenhagen with periodic
delivery checks. This is configuration/readiness evidence, not proof of a future
successful publication.

The authenticated final culture copyedit returned HTTP 200 `edited` for request
`liv-week-monsters-final-copyedit-v1`. The body is now 560 words: two grammar
defects fixed and event wording changed from "fandt sted" to "var annonceret til".
No source, image, previous fact result or revision history was replaced.

The culture retry returned HTTP 200 and saved Webflow item
`6aa56bc84e30064cbbb7c4c5`. All 22 factual claims passed with zero disputed.
Fresh review of the existing pixels passed; no new illustration was generated.
Independent CMS readback at 2026-09-12T15:13:03.346Z confirmed `draftConfirmed`
and `publicationReady`, correct author/primary topic/topics, no stars, exact body,
hero plus two body assets with actual byte/dimension matches. Field hash:
`90ef55c8af27d1b9cd2f2edf7f142238ff461c798d065cb0009b7f3f1595426d`.

Final authenticated production feed returned HTTP 200, `total:3`, all three
stories `ready`, all three cover images present, complete-sentence previews,
`queueEnabled:true` and `preparationEnabled:true`. The next eligible order is
Gentlemen (Sept 13 reserve), Freud (Sept 14), Frankenstein (Sept 15).
No batch publication was triggered; daily delivery selects one eligible story.
Instagram remains off.

The final tracked Liv ledger estimate was 35.3732 DKK across 80 calls with zero
reserved cost and a 300 DKK policy. This includes earlier tracked work and repairs,
not just the three articles; it is not the full account bill. The feed accurately
retains the old Sept 13 scheduled-preparation retry-limit warning; this does not
block the verified ready reserve. Saved failed plan/reason history is preserved
even when the admitted article status is draft/ready. TOV checks also retained
advisory comments about old excerpt truncation; feed display now uses complete
sentences, and future generated excerpts use the shared helper without a model.

All requested three-story preparations are complete. Future publication is not
guaranteed by a READY deployment or queue flag; its ordinary delivery checks and
published-page readback still run at the daily slot.

## Working guides used

Vercel API, deployments/CI-CD, investigation-mode, cron-jobs and CLI skills guided secure
service access, exact-SHA deployment, diagnostic-first repairs and renewal of the
existing CLI session. OpenAI platform API-key, API troubleshooting and OpenAI Docs
skills guided existing-key reuse, error classification and current price checks.
No key was printed or committed; no browser publication fallback was used.
