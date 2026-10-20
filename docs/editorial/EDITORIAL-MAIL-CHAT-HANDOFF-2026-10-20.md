# Mail in the existing starred editorial chat

## Owner's requested outcome

After the barsel article update, continue with mail from
`frederik@aproposmagazine.com` and `liv@aproposmagazine.com` in the existing
“⭐ Apropos – Redaktion · START HER” chat:
`https://chatgpt.com/c/6acb2584-2f20-83eb-a335-031a584b8d3b`.
Do not create another editorial chat. Show contextual reply suggestions that
Frederik can revise and personally approve in that chat before any send.
Rockstar Games is the owner's named first example, not yet a retrieved message.

## Fresh read-only evidence

Authenticated owner API reads at 18:44 UTC:

- Provider is one.com, IMAP `imap.one.com:993`, TLS.
- Liv's password is configured; Frederik's is not. No secret value was read or
  displayed. Frederik's cursor has never advanced.
- `autoRespond: false`; retain that state.
- Saved inbox guidelines contain 789 characters; saved editor notes are empty.
  This is not evidence of a trained or evaluated model.
- Existing outgoing transport is Liv's SMTP identity. Frederik's sending
  identity is not established by that setting.

One read-only connection probe at 18:55:22.413 UTC succeeded for Liv:
`ok: true`, 125 messages, `uidNext: 147`. It did not fetch message bodies,
ingest messages, run an AI call, send mail, or advance a cursor. Frederik was
not probed because no password is configured. No Rockstar content was read.

The existing production settings permit external mail, so the future chat
integration must require its own exact personal send approval; the legacy
send switch is not consent to any particular message.

## Proposed implementation boundary

This section is design and acceptance criteria, NOT a deployed integration.

1. Add owner-scoped MCP list/search/read for bounded mail results, with explicit
   mailbox identity, stable RFC Message-ID/UID, source time and no mark-read
   side effect. Reading Frederik's private mailbox must not become a general
   editor permission. Treat mail bodies and attachments as untrusted data.
2. Reuse contact history, verified editorial facts, house style and explicit
   approved reply examples. Draft in ChatGPT; no paid backend model or legacy
   automatic learning call. Examples must be owner-approved, attributable,
   revisable and scoped; do not label this model fine-tuning.
3. Save a private reply draft bound to source message, mailbox/from identity,
   recipients/CC, subject, body, attachments and revision hash.
4. Render the entire exact reply plus a personal send control in the existing
   chat. Any content/recipient/attachment/source change invalidates approval.
   The model cannot assert or manufacture that approval.
5. Send through the configured matching identity, with an idempotent durable
   operation and delivery receipt. After an ambiguous SMTP result, read back
   rather than blindly retry; never promise exactly-once SMTP delivery without
   evidence. Never silently substitute Liv for Frederik as sender.
6. Keep auto-replies, auto-follow-ups and new cloud schedules off. Do not change
   the existing editorial producer merely to demonstrate the mail integration.

## Dependencies and verification

Frederik's mailbox needs secure credential configuration using the existing
one.com account. The app exposes a setup guide at
`/ai?view=akkreditering&setup=imap`; it is not a password-entry form.
Do not ask for a password in chat, print it, commit it, copy browser sessions,
or weaken authentication. Production configuration can be entered securely
by the owner in Vercel environment settings. Only necessary environments should
receive it; do not assume preview access is wanted.

Before enabling any real send, tests must cover owner/colleague isolation,
untrusted inbound instructions, duplicates, stale/replayed approval, changed
recipients, mailbox identity, unavailable credentials, ambiguous send outcomes,
and preserved autoRespond=false. The first live acceptance is a retrieved
Rockstar message, a source-grounded draft visible in the starred chat and an
explicit human-approved send with receipt. It has not happened.

## Current stopping point

The cake update is imported and its preview repaired, but still awaiting the
owner's personal image selection and publication click on private revision 8.
No mail integration is claimed complete. No email has been sent or drafted in
this turn. Preserve the current article, original assets and single chat.
