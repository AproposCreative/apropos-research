# KK Reader: Mac-independent reading acceptance

## Owner requirement

On 6 October 2026 the owner approved a separate ChatGPT Work cloud test and
explicitly required a repeatable, automatic future workflow, not a one-off local
Chrome demonstration. The desired input is a legally borrowed reader link.
The existing Apropos editorial, media, SEO, CMS and approval workflow remains the
downstream system. No additional AI/review engine is authorized or needed.

Prefer direct Work Cloud Browser reading, then a minimal supported session bridge
only if necessary. A local extension is not the preferred solution and does not
satisfy the Mac-independent requirement. Do not build speculative ingestion or a
permanent book archive before verifying actual cloud access.

## Acceptance checklist

- [x] Actual remote Cloud Browser opens the authorized loan, without any connected
      Mac, local Chrome session, copied cookies or local relay.
- [x] A bounded sample can be read in order, advanced and revisited using normal
      reader controls. The title, available chapter/position identifiers and
      observed pagination are recorded without assuming reflow positions equal
      printed pages.
- [x] One same-task reload recovers a previously recorded position, confirmed against a
      short text anchor or hash. Record the tested scope; same-task reload does
      not prove survival across a new task, an expired session or an expired loan.
- [x] The repeatable workflow records a small private checkpoint and coverage
      index after bounded reading batches. Missing intervals and uncertainty stay
      visible. Merely visiting a position, an offscreen preload or the last page
      does not establish that its text was read.
- [x] A subsequent continuation can retrieve that checkpoint and resume without
      manually copying text or starting from the beginning. Verify this before
      describing future reading as automatic. Verified in the same remote
      browser profile, plus independent MCP-client readback; not a fresh browser
      profile or an expired loan.
- [x] Full-book completion requires evidence of all relevant chapters/intervals
      being read in sequence, with gaps resolved. A sample test is not completion.
      The real cloud task reports complete visible reading, with 23 ordered
      reading batches and separate server readback. This remains client-reported
      reading, not independent proof of comprehension.
- [x] Login, CAPTCHA, loan expiry and unavailable browser capabilities become
      explicit actionable states, not silent success or a bypass. Use the
      supported secure sign-in/takeover UI when needed; never ask for credentials
      in chat or store credentials in Apropos. Covered by isolated regression
      tests and workflow; real loan expiry/CAPTCHA was not induced in this run.
- [x] No backend LLM calls, embeddings, AI summaries, new paid providers or bulk
      book export during reader collection. ChatGPT usage still counts against
      the user's plan; zero backend AI calls is not unlimited free execution.
- [x] Existing Apropos auth, private workspaces, revision/audit and publication
      controls are reused. No automatic publication or new editorial permission
      is inferred from reading completion.

## Evidence and current limitations

The earlier local Chrome feasibility check opened the book and navigated normal
reader UI. Visible contents identified *I mellemtiden er vi ingen*, chapters
1–32 and a layout reporting 133 reader positions. This is LOCAL evidence only,
not proof of cloud access, fixed pagination, complete reading or export rights.
The separate in-app-browser check remained on loading; its cause was not
established, and the in-app browser is not Work Cloud Browser.

Code inspection found existing private MCP draft/workspace notes, research,
version checks and editorial workflows. No reader/session bridge or actual
cloud-browser control exposed through the current Apropos MCP was established.
The named `apropos-book-review` skill was not found in the checked repository;
do not invent its implementation or treat an operator dossier as full-read proof.

The owner-authorized cloud creation request on 6 October returned only
`clientThreadId: local-chatgpt:be903962-bb69-4f03-9894-62b03b664f5e`, not a confirmed
server conversation ID. The requested title was “KK Reader — cloudadgang og
genoptagelse”. Subsequent thread listings had not yet exposed it at 18:17 UTC.
The ChatGPT project UI subsequently exposed conversation
`6ac53af1-96ac-83eb-b494-56233991d5b2` with the exact requested test prompt.
Supported `read_thread` confirmed an active ChatGPT task; no browser result was
yet returned. Do not interpret this creation receipt as an executed cloud test.
Do not retry creation blindly and risk duplicate tasks. The loan URL is
deliberately omitted from this repository document; it remains in the authorized
task context.

### Completed cloud feasibility test

The task completed in the durable cloud executor
`01a1126e-50f8-712b-9596-49c47f41505c`, workspace
`/workspace/scratch/94893bceb287`. The execution trace was read independently
through `read_thread`, not inferred from the task title or a deployment.
It records use of the remote `cdp` browser, normal reader clicks, visible DOM
inspection, a reload and a small checkpoint file. No local computer relay was
used for the reader. Local Chrome was used only by the coordinator to find/read
the resulting ChatGPT task when the thread inventory lagged.

- Book observed: *I mellemtiden er vi ingen*, Frederik Drescher Kluth.
- The authorized reader link opened without a login prompt in this test.
- Visible contents: chapters 1–32. Cloud layout reported 154 reader positions,
  whereas the earlier local layout reported 133. This confirms that a bare
  numeric reader position is not a portable cross-layout identifier.
- Navigation sample: `4 → 6 → 8 → 6 → 4` in a two-column spread.
- Same-task reload returned to `Side 4-5 af 154`, slider value 4, with the same
  short chapter-1 text anchor. The checkpoint timestamp is
  `2026-10-06T18:18:41.292Z`.
- The small technical checkpoint is an artifact in that cloud task, not a new
  Apropos database record or an ingested book. Its actual loan URL and text anchor
  are intentionally not copied into this repository.
- Zero Apropos backend AI calls were invoked by this test. It used a ChatGPT Work
  task and therefore is not evidence of unlimited subscription usage.

This passes the narrow cloud-access/navigation/reload test. It does NOT pass
automatic full-book reading, cross-task checkpoint recovery, expiry handling or
systematic complete coverage. No review was written or published.

## Smallest architecture after the feasibility result

Use ChatGPT Work Cloud Browser itself as the source reader. Do not add an
extension, hosted browser provider, book store or backend AI model merely to
repeat the working access path. Apropos MCP does not itself expose or control
that cloud browser; ChatGPT coordinates browser reading and existing MCP tools.

The only potential new integration is a small versioned workflow/checkpoint for
systematic reading, using an existing private source/workspace where suitable.
It should record book/edition identity, chapter, a stable reader locator when
available, layout-dependent position plus layout information, a minimal anchor
or hash, last confirmed interval, gaps and completion state. Do not invent a
stable locator when only reflow pagination is available. Existing free-form
workspace notes require an article/draft identity; do not create a dummy CMS
article merely to hold an unfinished reading test.

Before implementing a new storage contract, test whether the cloud task's small
checkpoint can be reused by a later continuation and whether the current
private workspace can hold the final dossier without new infrastructure.
Default future behavior should be sequential bounded batches, checkpoint after
each confirmed batch, resume from the first gap, and stop with a precise reason
if access expires. Full-read status must not be inferred from a percentage
generated by the model or the last page reached. A login-required state is a
real human dependency, not something the system may silently bypass.

## Resume from the first unverified step

Continue from checkpoint reuse across a later continuation/session; the first
cloud test is complete and must not be recreated just to demonstrate activity.
Use the confirmed ChatGPT task and its checkpoint. A later task or follow-up
message still requires the app's applicable user authorization. If website
access/login is requested, let the owner complete only that necessary step.
If the cloud browser is absent, record that capability failure rather than
substituting local Chrome or an HTTP fetch. Add only the smallest missing
checkpoint/workflow integration supported by the result. No production code
was changed or deployed for this test.

### Owner-requested implementation continuation

The subsequent explicit request “Byg nu løsningen færdig og deploy den” authorized
the minimal private MCP index and versioned read workflow. Implementation and
local regression evidence are in `MCP-READER-INDEX-2026-10-06.md`. Cross-task browser
continuation and full-book coverage remain separate acceptance items; they are
not inferred from the existence of storage or a successful deployment.

Production verification on 6 October at 19:30 UTC confirmed MCP v9 and the new
reader workflow on deployment `dpl_AjWf9kQPFW2w5D2AHZxiD5U8iJhA`, commit
`3da4345f7eb0c041517bdea5af704e621bd7bf3a`. The real earlier cloud checkpoint is
now preserved privately at source
`5987a89e1425ef21c2e8eb7d5dda65a4c971020991490620572b14d0592d751b`, revision 1.
An independent second OAuth session retrieved the same checkpoint; receipt
replay, stale-revision rejection and bounded notes search were verified. This
passes **server checkpoint persistence**, not cross-task browser navigation.
Zero complete read intervals were recorded, and full-book acceptance stays open.
No backend AI call, library credential, public article or paid retry was added.

### Authorized continuation and client tool discovery

The owner's subsequent “Du har tilladelse kør” authorized continuation in the
existing cloud test, not creation of a duplicate. Its first follow-up retained
the remote browser and could retrieve the deployed `get_workflow(read)` with the
correct workflow hash, but normal ChatGPT tool discovery did not expose the new
reader tool names. It therefore made no reading-index writes. A separate
read-only server check at `2026-10-06T19:43:42.421Z` confirmed revision 1 and zero
read intervals. This was a client metadata failure, not missing library login or
evidence that the deployed MCP handlers were absent.

Used the existing Apropos AI connection's normal **Refresh tools** control in
ChatGPT Plugins settings. After refresh, the app details visibly advertised
47 tools (18 Write / 29 Read), including all five reader tools. Existing OAuth
account and “Allow low-risk tools” permission remained unchanged. Local Chrome
was used only for this connection-setting repair, never as a reader fallback.
A follow-up was sent to the same authorized cloud task to retry discovery once
against this new evidence, then verify actual batch save/readback/resume. UI tool
discovery is not yet proof that the existing conversation can invoke them.

This follows the official [ChatGPT connection update procedure](https://developers.openai.com/plugins/deploy/connect-chatgpt),
read 6 October 2026. That procedure also recommends a new conversation after
refresh; if the existing task retains its old tool definitions, report that
remaining boundary rather than bypassing authentication or silently creating a
duplicate task.

The same conversation subsequently discovered and invoked the new read tools.
Independent `mcpAudit` readback confirmed `list_reader_sources` at
`2026-10-06T19:50:18.161Z` (159 ms) and `get_reader_progress` at
`2026-10-06T19:50:26.010Z` (202 ms), both `ok`. Thus a duplicate chat was not
needed for this particular refresh. At `19:53:52.238Z`, coverage still correctly
remained zero and revision 1 while the cloud task verified the browser layout;
do not translate successful tool discovery into a successful save/resume or
full-book test. No production code or deployment changed during this repair.

## Official product evidence

[ChatGPT Work browser](https://learn.chatgpt.com/docs/browser), read 6 October
2026: remote execution does not inherit local browser sessions, supported plans
can use a secure website sign-in flow, and availability/site restrictions apply.
This describes product capability, not successful access to this specific loan.

## Completed authorized reading acceptance — 6 October, 22:17 Copenhagen

The same cloud task finished at approximately `2026-10-06T20:16:45Z` and its
completed report was retrieved with `read_thread`. It reports actual sequential
visible reading in remote CUA/CDP, through chapters 1–32 and the final
“Om I mellemtiden er vi ingen” position. No local reader, library credentials,
book export, backend AI generation or article publication was used.

The first run needed operator assistance: a normal ChatGPT tool-list refresh,
then diagnosis of the per-batch boundary flag ambiguity. The v10 fix and
production evidence are in `MCP-READER-INDEX-2026-10-06.md`. Do not describe this
as a wholly unassisted first run. After the corrected save, the same task
continued to the end without further coordinator messages.

Independent authenticated MCP readback at `2026-10-06T20:17:15.007Z` confirmed:

- Source `5987a89e1425ef21c2e8eb7d5dda65a4c971020991490620572b14d0592d751b`,
  revision **24**, access `available`. The book identity is
  *I mellemtiden er vi ingen*, Frederik Drescher Kluth; edition was not supplied.
- Reading layout `4387f465f316f10aa11af4c3f84e021ee171c1f85be1d2bf6241da2372cf99b1`:
  viewport 1363×932, two-column Auto, text 100%, line 120%, margins 5%, standard
  theme, page animation, EPUB3, font family not exposed. **154/154 positions**,
  zero gaps, both boundaries observed, `reported_complete`, next position null.
- All 24 immutable historical batches were retrieved in **three bounded pages**,
  with contiguous unique revisions 1–24. Revision 1 is the earlier zero-reading
  technical bookmark; revisions 2–24 are 23 real reading batches. The old layout
  still has zero coverage and was not merged into the complete layout.
- Ordered batch ends: 6, 13, 21, 28, 36, 42, 49, 57, 62, 68, 73, 78, 82, 87, 93,
  101, 108, 118, 126, 134, 142, 150, 154. Each next interval starts at the prior
  end plus one. The last batch explicitly includes position 154 after chapter 32.
- The cloud task reloaded after revision 6: the same profile reopened at position
  36, then resumed at first gap 37. This is later-continuation/same-profile
  recovery, not a new-profile authentication or expired-loan test.
- Actual notes searches succeeded: the cloud task retrieved “Dratko” notes near
  positions 68/73; a separate MCP client paginated a “Hols” search across three
  pages and found revisions 7, 8 and 11. Search is of notes/anchors, not full text.
- `publicationApproval=false`. Workspace, welcome receipt, shared AI ledger and
  provider-hold data were unchanged by the final readback. Zero paid backend AI
  calls were started. The temporary verification grant was revoked; existing
  ChatGPT connections remained intact. The local read-only observer exited once
  completion was recorded; it was never a reader runtime dependency.

This completes the scoped real-book reading/index/save/resume/search test. The
server independently verifies persisted data and gap calculation, **not** that
the model comprehended every page: `independentlyVerified` remains false.
The cloud execution report is the reading evidence; a coverage percentage alone
must never be used as that evidence. No review has been produced or published.

### Repeatable use and explicit operating boundary

In a Work chat that actually has Cloud Browser and Apropos AI connected, ask it
to use `get_workflow(read)` for the loan and resume its private source if present.
It can read bounded batches, save notes and recover from the first gap. Use the
existing editorial/submission workflow only afterwards, with the usual approval.

The Mac can be off for this cloud reading. MCP itself does not create or schedule
Work tasks, provide a missing browser capability, or keep an ended chat running.
Future use still needs an active authorized cloud task, a valid loan/session and
layout validation. A genuinely fresh browser profile, forced loan expiry or
CAPTCHA was not tested; no promise of perpetual login or all-future unattended
execution is made. No library login was stored in Vercel.
