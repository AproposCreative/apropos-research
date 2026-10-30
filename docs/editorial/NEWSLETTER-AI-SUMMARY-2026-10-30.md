# Restore the Friday newsletter's AI editorial summary

The owner requested the earlier style: one original thematic headline and two
connected editorial paragraphs, with the selected book as the lead. The owner
then authorized implementation after discussing a separate 10 USD allowance.
This is a fixed application allowance, not a provider purchase, credit grant,
monthly budget reset or permission for paid Liv/SEO/image automation.

## Bounded operation

- Dedicated server-owned newsletterAiLedger/policy, id
  newsletter-intro-10usd-2026-10-30-v1: enabled, fixed lifetime limit 10,000,000
  USD micros, no automatic reset, per-call quote at most 100,000 USD micros.
  Activation must create only when absent and preserve all existing usage.
- Only the weekly newsletter path can create a summary. It uses the existing
  OpenAI connection, GPT-5.4 mini, default service tier, no reasoning, 1,000 maximum
  completion tokens, no tools, no provider storage and one transport attempt.
  Standard text prices 0.75 USD/M input and 4.50 USD/M output verified on
  30 October at https://developers.openai.com/api/docs/models/gpt-5.4-mini.
- All selected articles are read from exact live CMS items before generation.
  The model gets titles, subtitles, excerpts and ratings, with the first item
  designated as the feature. Two editorial paragraphs, no invented facts,
  popularity claims, typographic dashes or generic substitute introduction.
- A Firestore transaction reserves the quoted upper cost and a send-week job
  before transport. Shared no-paid context and configured provider holds are
  respected. Liv/Writer policies, ledgers, holds and reservations are not modified.
- Exactly one provider attempt per Copenhagen send week. Completion stores the
  generated text with its frozen ordered article selection and source hash.
  Repeated reads/retries reuse the same text; Firestore map ordering is normalized.
  The saved articles are revalidated live before reuse; changed feature/source or
  withdrawal requires review. Newly appearing unrelated articles are not appended
  to an already prepared summary's frozen selection.
- Valid usage settles an estimated standard-rate upper cost, not an invoice.
  Unknown usage retains its reservation. Timeout, HTTP error, incomplete/invalid
  output or persistence uncertainty retains the reservation/job for review and
  never buys a second call automatically. Raw exception details are not exported.
- Cron requires introSource=ai before sending. Failure is visible and sends no
  generic substitute. Normal previews are cache-only. Authenticated existing
  dryRun=1&withAi=1 explicitly prepares the bounded weekly summary without
  claiming/sending the newsletter. Friday schedule, recipient list and send
  deduplication are unchanged. Cached preview exposes introSource.

## Verification / release

Targeted tests cover fixed caps, missing policy and provider hold, no-paid context,
cache reuse, concurrent attempts, unchanged Writer/Liv accounting, quota error,
timeout, unknown usage, changed source/withdrawal, invalid output, and cron
dry-run/no-send/failure behavior, alongside existing feature/summary regressions.

53 tests across the six focused newsletter/feature/summary/Liv pricing suites
passed. Focused ESLint, security configuration and the application TypeScript
check (excluding unrelated untracked output scripts, preserving the original
tsconfig exclusions) passed. The repository-wide check includes an existing
untracked output/ringo-bio-publish-20261028.ts Root.text error; this task did not
modify that script. The exact production commit also built successfully.

### First production preparation

Commit 7d6b9833094598a8c79a580fb0419414abb97d8f was verified READY on the actual
ai.aproposmagazine.com alias, deployment dpl_ASxGmPZfGvAHGP1zvmPLPyzbunwV.
The dedicated policy was created once, without changing other policies/counters.
At 2026-10-30T09:59:38.008Z the protected production cron dry-run confirmed:

- week 2026-W44, introSource=ai, five exact live articles;
- book 6ae1f9da0e01d3d2ff34859f first and as the rendered hero;
- one actual GPT-5.4 mini call, 988 input / 263 output tokens;
- provider request req_bf98bc6071b14c7689dab58a8278d324;
- 1,925 USD micros (0.001925 USD) estimated standard-rate upper cost,
  zero remaining reservation, one call of the fixed 10 USD allowance;
- a subsequent cache-only production dry-run added zero paid calls;
- the Friday 13:45 Europe/Copenhagen setting, book selection, shared paid
  policy and Liv ledger/policy were unchanged; no weekly send had started.

No provider credit was purchased or granted. A successful actual call is evidence
that this call worked with the existing connection, not a provider balance audit.
The estimate is not an invoice. Raw receipt:
output/newsletter-check-2026-10-30/ai-summary-production-receipt.json.

### Editorial review before the scheduled send

The first provider result incorrectly framed the book as screen content, called
the anniversary a farewell and exposed internal feature/hero language. It was
reviewed against the saved live source excerpts and corrected in the existing
week job without another provider call. Original provider output, request ID,
token usage, source identity and cost remain preserved. The record identifies
this as assistant-source-review, not a fabricated owner approval.

The reviewed headline is “Boligjagt, hævntørst og rock med puls”. The two paragraphs
lead with Laura Ringo's book, then connect The Terminal List, Lanterns, Placebo's
30-year celebration and Deep Purple. The production cache-only preview confirms
the reviewed text and book lead; calls remain one. Future prompts distinguish
media/anniversaries and the parser rejects internal feature/hero wording.

Evidence: output/newsletter-check-2026-10-30/ai-summary-reviewed-receipt.json
and ai-friday-reviewed-preview.html. These preparation/readback checks do not
claim delivery of the scheduled newsletter. No mail was sent by this task.

### Final production verification, 30 October 11:09 Copenhagen

Editorial prompt/parser correction e8dac3ab5de939c6650aebcf5e743469f8150954
is READY as dpl_CXiQFsDf4qdUT4yYtTrEWwnPvaV5 and matched by a direct lookup of
the actual ai.aproposmagazine.com alias. At 2026-10-30T10:09:10.613Z another
protected cache-only production dry-run returned HTTP 200, introSource=ai,
the reviewed headline as the email subject, matching introductory text and the
book first. Dedicated accounting remained exactly one call / 1,925 USD micros /
zero reserved; shared state and schedule were unchanged. Friday auto-send is
enabled for 13:45 Europe/Copenhagen and had not started at verification.

The two affected suites passed again (14 tests) after the correction. The final
receipt is output/newsletter-check-2026-10-30/ai-summary-release-receipt.json.
This records prepared content and the configured schedule, not future delivery.
