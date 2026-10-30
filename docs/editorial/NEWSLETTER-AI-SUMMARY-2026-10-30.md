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
Production receipt and actual usage will be appended after controlled preparation.
