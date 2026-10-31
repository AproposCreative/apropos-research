# SoMe spacing and Facebook comment diagnosis, 31 October 2026

The owner requested a check of the Terminal List season 2 publishing errors and
an adjustable distance between a card's headline and subtitle.

## Verified incident

Read-only inspection at 14:06 UTC confirmed two separate operations: a feed post
at 13:51 UTC (Instagram and Facebook both published) and an Instagram Story at
13:52 UTC (published). These are different formats, not evidence of a duplicate
attempt. The feed operation's article-link comment was definitely rejected with
Meta code 200. Original operation records and request IDs are retained unchanged.
Facebook's actual post readback returned `is_published=true`.

The retained connection is a valid PAGE token for the configured Page. Its actual
debug scopes include `pages_manage_posts` and `pages_read_engagement`, but omit
`pages_manage_engagement`. Comment readback additionally rejected access for lack
of `pages_read_user_content`; therefore no claim is made that existing comments
were enumerated or that the missing link was repaired. No permission, credential,
token, post, comment, provider budget or reservation was changed. Restoring comment
publishing requires a personally authorised Meta reconnection with comment access.
Evidence: `output/social-spacing-meta-20261031/inspection.json` (no credentials).

## Implementation

- Headline controls expose **Afstand**, **Tættere**, **Mere luft**, and **Auto**.
  The actual gap between glyphs changes independently of font size, in both formats.
  Preview, PNG and publishing JPEG share the same renderer.
- The choice is saved with the source-bound article draft, restored on reload or
  another device, and included in the approved publishing snapshot. Existing drafts
  default to 24 canvas pixels; no bulk draft rewrite is needed. Bounds are 0–120.
- Default spacing retains the historical publication identity. Custom spacing
  identifies a changed design; it never unlocks a retry of the old version.
- Receipts show per-channel publication status separately from the post link.
  A denied Facebook comment is explained specifically, including old receipts,
  without rewriting them or claiming that published posts failed.
- Checking an older receipt keeps the actual newest publication at the top.
  Checking status sends no post or comment. The check button has a busy state.
- Connection diagnostics and reconnection help identify the missing comment scope
  separately from the otherwise working posting connection. No permission is
  granted automatically. Story download is disabled while text validation is pending.

## Verification

- 59 targeted isolated tests passed across six suites, including lost responses,
  old/default deduplication identities, explicit channels, failed comments, spacing
  persistence, invalid inputs, and Page-specific permissions.
- 36 real bundled-Amiri canvas cases passed: square/Story, light/dark, 70/100/150%
  headline sizes, and 0/24/72 pixel gaps. Actual glyph bounds match the requested
  gap; default positions remain unchanged. PNG and JPEG geometry are identical.
- The actual editor fixture passed reload, second-device restore, stale-device
  conflict handling, Story export, explicit channels, duplicate-click protection,
  lost-response readback and layouts at 320/390/768/1440px. Its three publishing
  operations are local fixtures, not real social posts.
- Application TypeScript and scoped ESLint passed. The initial full local build
  exposed unrelated retained scratch TypeScript under `output/`; these files are
  excluded from the isolated application check and are not release source.

## Production verification

- Implementation `9dfdf664ca2fbbfc83ae45a4e0d06397d04cf750`; clean release
  `06d4578bb722c3a034e0a3aff2b2c99d40872cb3` retains all 19 newsletter files
  from the preceding live `02b38b4f` release as exact Git blobs. Unrelated local
  newsletter and observer journal work was not staged, overwritten or deployed.
- The exact release source snapshot passed the full Next build: compilation,
  TypeScript and 249 pages. Four pre-existing podcast filesystem-tracing warnings
  remain. The snapshot did not include local scratch output or credentials.
- Vercel `dpl_5Sm385qdxiSV11PTRJudcLwGuQPE` is READY for the exact release SHA;
  the real `ai.aproposmagazine.com` alias was verified on that deployment.
- Public source readback at 14:18:57 UTC found the spacing controls, saved field,
  specific comment error and access link in the served JavaScript. Draft and
  publishing endpoints still reject anonymous access with 401.
- Actual authenticated browser readback showed the Terminal List season 2 card
  with **Tættere** and **Mere luft**. `live-controls.png` records that view.
  Desktop `/ai` without a view parameter still opens AI Writer, the retained
  Spline background and the original desktop tool catalogue including paused tools.
  No social publish button or spacing change was used in this live check.
- Error/fatal runtime scan scoped to this deployment, 14:08:55–14:18:55 UTC,
  returned no entries. This is a bounded scan, not a claim about all traffic.
- Production source evidence: `output/social-spacing-meta-20261031/release.json`
  and `production-assets.json`. Tests, browser fixture and geometry reports are
  in the same directory. The real Meta permissions remain unchanged; personal
  authorisation for comment access is pending.

## Owner correction: article links belong only to Instagram Story

The owner's subsequent instruction replaces the proposed Facebook permission
repair: article-link controls must only be offered for Instagram Story. The
earlier comment-access request is no longer needed. A later answer approved that
older request; the access is unnecessary for the requested Story flow, so no Meta
access or credentials have been changed and no comment has been sent.

- Removed the automatic Facebook comment operation from the publisher and its
  transport. Newly claimed operations retain a skipped comment field only for
  receipt compatibility; successful feed posts complete without a comment.
- Removed comment-management scope recommendations, capability warnings and
  permission-repair links. Old rejected or uncertain comments remain identified
  as historical evidence; their records and duplicate locks are preserved.
- Story still offers image download and article-link copy for Instagram's link
  sticker. The feed offers no article-link control. The graphic CTA does not
  create an interactive sticker, and automatic Story publication does not add one.
- 42 targeted tests passed, including actual API/Graph fixtures with zero comment
  requests, historical receipt readback/replay locks and no access escalation.
  Scoped ESLint and diff checks passed. The editor fixture passed ten checks,
  including Story-only link controls, reload/conflicts, spacing, explicit channels
  and lost responses at 320/390/768/1440px. Three local fixture publications;
  zero real posts, comments or paid calls. Evidence:
  `output/social-story-links-20261031/ui/report.json`.

Production receipt: implementation `26b49d020692878805cbb973a640289726092780`,
release `e5758150a36eb92d4fa4b22c8aa514f16c9ba1e3`, deployment
`dpl_xWpXZ8iYVBZrH2LgxkTipz1XJCPX` READY on the actual
`ai.aproposmagazine.com` alias. The exact release passed full compilation,
TypeScript and 249-page generation. All 20 differing paths in the prior combined
production tree were preserved as exact Git blobs. No unrelated newsletter or
observer work was included. Four existing podcast tracing warnings remain.

Public asset readback at 14:29:45 UTC confirms the historical-error wording and
Story controls are served, while the Facebook comment-access prompt is absent.
Anonymous draft/publishing reads remain 401. Authenticated browser readback also
confirmed the 1:1 editor has no article-link control or access-repair prompt.
No real publishing button, AI button, draft change or permissions change was used.
A deployment-scoped error/fatal scan through 14:29:43 UTC returned no entries;
this is a bounded early-release window. Source and public-readback evidence is
in `output/social-story-links-20261031/{release,production-assets}.json`.

## Verified Business Suite Story link, 31 October 2026

The owner subsequently authorised exactly one additional Instagram test Story for
Terminal List season 2 on `@aproposmagazineofficial`. It was published through
the signed-in Meta Business Suite browser editor at 16:59 Europe/Copenhagen.
Facebook was deselected. Exactly one **Del** click was dispatched; the original
feed and Story operation receipts and duplicate locks were not changed.

The main **Tilføj link** control remains disabled with Instagram alone selected.
However, **Rediger → Flere klistermærker → Link** accepted the article URL and
the custom label **Læs anmeldelsen**. This separate editor path retained a real
interactive sticker on the published Instagram Story, not merely graphic text.

At 16:04:03 UTC, the live Story was verified from the `aproposcreative` viewer
account: clicking the sticker opened **Gå til link**, and following that control
opened the rendered article with heading **Anmeldelse: Terminallisten, sæson 2
på Prime Video** at the expected article path. Instagram added its ordinary
`fbclid` query parameter. This confirms the specific Business Suite browser path
on this account; it does not demonstrate native-app behaviour or unattended
future publishing.

- Meta media ID: `18017959208953279`.
- Public Story: https://www.instagram.com/stories/aproposmagazineofficial/4020176256339185742/
- Destination: https://www.aproposmagazine.com/articles/terminallisten-saeson-2-anmeldelse
- Evidence: `output/meta-story-link-20261031/publication-attempt.json` plus
  `published-meta-receipt.png`, `published-instagram-story.png`,
  `live-clickable-link.png` and `clicked-article-destination.png`.

Meta's Instagram publishing API still documents Story stickers as unsupported:
https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
The existing Apropos **Udgiv** flow still uses that API and has not been connected
to this browser workflow. No app code, permissions, credentials, background
producer, budget or deployment was changed for the one-Story test. The test
Story remains published; no deletion or second publication was authorised.

## Requested one-button hosted integration: unresolved acceptance

After the successful single-Story test, the owner explicitly requested the
existing SoMe workflow: select **Story**, press **Udgiv**, and automatically
include the clickable article link. No chat handoff or extra task-copy step is
acceptable. It must operate on the server with the owner's computer off and no
open chat. The clickable button must look exactly like the existing black pill
with white **Læs nu på Apropos Magazine** text. This is a requirement, not a
claim that the integration is implemented or hosted.

An additional unpublished Business Suite inspection found a concrete mismatch:
the native link label has `maxlength=25`, while the requested label has 26
characters. Normal entry truncates it to **Læs nu på Apropos Magazin**. The
sticker renders black text, a white background, a chain icon and Meta's own font.
The separate text tool's font/color controls and a double click did not change
the sticker style. No supported transparent hotspot or custom image overlay
control was found in the inspected editor. This is bounded UI evidence, not a
claim about every possible Instagram app or integration.

Evidence: `output/story-native-design-20261031/inspection.json`, `text-limit.png`
and `native-style.png`. The shortened label **Læs på Apropos Magazine** was used
only in the unpublished inspection. No new Story was published, and no app code,
permissions, credentials or hosting was changed. No server-hosted social browser
worker has been provisioned or verified. The existing podcast processor is a
separate workload and was not repurposed. The exact-design and unattended-hosting
requirements remain unresolved; do not describe the earlier local browser test
as satisfying them or silently ship a different button.

## GitHub research: alternative server transport

The owner explicitly asked for existing GitHub implementations. Research found
an alternative to the Business Suite browser editor; the editor's observed
25-character/style restrictions must not be described as universal technical
limits on all possible Story publishing methods.

- `subzeroid/instagrapi`: the maintained project's Story documentation supports
  `photo_upload_to_story(..., links=[StoryLink(...)])`. Source read at immutable
  commit `1265dff41ec43e08b5ccf3aea31c1b5185302fae` confirms that the photo
  configuration serialises the link's x/y/width/height into a `story_link` tap
  model. The JPEG upload and interactive metadata are separate operations.
  This suggests retaining the existing drawn black CTA and binding its exact
  rectangle to the article URL. Exact visual output and click behaviour on
  Apropos have NOT been verified for this transport.
- The maintainer closed issue 2320 on 16 April 2026 after fixes retaining all
  sticker IDs and extracting link-sticker URLs. Their reported live test uploaded
  a temporary Story and read its parsed links back. That is maintainer evidence,
  not our account test or proof of a viewer clicking the intended rectangle.
- `subzeroid/aiograpi-rest`, the renamed successor of `instagrapi-rest`, provides
  a Docker/HTTP service around the async private API client. Its README and
  Dockerfile were read. This is a potential independently hosted architecture,
  not an already configured Apropos service. It does not require the owner's
  computer to stay on once deployed and authenticated; deployment, persistent
  session handling and operation still need to be built and verified.
- `dilame/instagram-private-api` was also inspected. Its public README points to
  a paid/private newer version, and the old link-sticker issue 1518 was closed as
  not planned. No evidence establishes it as a better choice for this requirement.

These are unofficial/private Instagram clients, not extensions to the existing
official Page token. The instagrapi maintainer explicitly describes private API
automation as fragile under account challenges, device/session changes and rate
limits. Do not silently replace the official publishing transport or copy browser
cookies. The default upload helper also contains a configure loop; any eventual
adapter must preserve the existing durable one-operation lock, record dispatch
intent, disable unsafe automatic resends and reconcile ambiguous results first.

No third-party package was installed or executed, no credentials/session were
read/exported, no account was connected and no Story was published for this
research. Sources actually read:

- https://github.com/subzeroid/instagrapi
- https://subzeroid.github.io/instagrapi/latest/usage-guide/story/
- https://github.com/subzeroid/instagrapi/blob/1265dff41ec43e08b5ccf3aea31c1b5185302fae/instagrapi/mixins/photo.py
- https://github.com/subzeroid/instagrapi/blob/1265dff41ec43e08b5ccf3aea31c1b5185302fae/tests/regression/test_story_configure.py
- https://github.com/subzeroid/instagrapi/issues/2320
- https://github.com/subzeroid/aiograpi-rest
- https://github.com/subzeroid/aiograpi-rest/blob/main/Dockerfile
- https://github.com/dilame/instagram-private-api
- https://github.com/dilame/instagram-private-api/issues/1518

### Hosted Business Suite implementation, 31 October 2026

The owner accepted retaining the existing black drawn CTA and adding Meta's
native clickable sticker. Exact visual identity of the native sticker is no
longer an acceptance blocker. The requested entry point remains Story → Udgiv;
no open chat or running owner computer may be required after personal approval.

A separate Chromium worker and the existing editor/API are implemented locally.
The exact approved JPEG digest, existing semantic duplicate identity, immutable
channels and personal request receipt are retained. Creating the browser task
and publication receipt is one transaction. The worker persists a one-click
intent before Del; ambiguous outcomes retain the account lock. There is no Graph
fallback or automatic second publication. A minute-based server drain handles
only queued tasks which have never dispatched. Approval expires after 30 minutes;
current verified Firebase identity, suspension and revocation are checked again
before the publish click. Host crashes become stopped/uncertain receipts instead
of endless pending indicators. Existing Graph receipts replay unchanged.

The worker has a dedicated service credential limited to two bounded Story
endpoints, not the general INTERNAL_API_SECRET. It receives only the approved
job/image URL and its own Meta session. It needs no Firebase private key,
Firestore IAM role or unrelated provider credentials. Its login is completed by
the owner in an authenticated, owner-only screenshot interface. Session state is
restricted to Facebook/Instagram and encrypted at rest with AES-256-GCM. Local
browser profiles/cookies are never copied. A saved connection is a dated login
observation, not a promise that Meta will never request renewed verification.

At this checkpoint 69 focused tests pass, covering transactions, duplicate locks,
expired/revoked approvals, missing login, tampered image identity, service scope,
unknown publication results and historical Graph behavior. The implementation is
not yet a verified deployed server flow. No additional real Story has been sent.
The prior one-off test receipt remains the only verified live clickable Story.

### Hosted release and personal-login checkpoint, 31 October 2026

The owner explicitly approved creation of the persistent Story service connection
and its separate service credential in Google Cloud and Vercel. The connection is
now deployed. No local Meta cookies/profile were transferred. Temporary credential
transfer files were removed after authenticated service readback; no credential
values are retained in evidence or Git.

- Web source `1f373c1b5883c43060d217b3c886e4ea3ce5fad7`, production deployment
  `dpl_3xjTgRa2yUHrH9XJgucywN12C2Lk`, alias `ai.aproposmagazine.com`.
- Worker source `014b0225b803c2c41981732aa85ab118883a5f61`, Cloud Build
  `f9eab2bf-760f-46b2-9bde-9014c888f71a` succeeded; image digest
  `sha256:8590c9ef1672f5964c52935902c2cdf459381ed08e457987c0024b4861821877`.
  Cloud Run revision `story-browser-00003-v46` became Ready at
  `2026-10-31T17:53:52.144478Z` with the dedicated service account. This account
  has no project IAM roles. The worker has no Firebase key.
- Active Firestore whitelist rules already deny client access to private Story
  collections; rules were read and not replaced. Existing iOS preference rules
  remain intact.
- 73 focused tests passed, followed by 8 runtime tests for the final popup-scale
  correction. Scoped lint/typecheck and the full local webpack build passed.
  The actual production build also compiled, typechecked and generated 254 pages.
- Production connection page returns 200 with frame denial and private/no-store;
  unauthenticated publish and worker calls return 401; worker health returns 200.
  An authenticated service status read at `2026-10-31T17:48:34.159Z` was 200 with
  `connected=false`. This was before revision 3 and remains dated evidence.
- The owner login page now renders the real Facebook popup at 1650 by 1045,
  matching click coordinates. Popup following and viewport normalization were
  verified without entering credentials. Screenshot:
  `output/story-server-20261031/ui/server-meta-login-ready.png`.
- Desktop `/ai` without a view query was visually checked: Writer opens over the
  large robot and the original desktop menu remains available. Existing black
  Story CTA remains part of the supplied design.

The server's personal Facebook/Instagram login is still pending. The owner-only
`/social-story-connection` page is open for that action. The hosted publication
path has not yet produced a real Story, so Ready deployments and tests are not
reported as completed end-to-end delivery. No new publication permission is
inferred from the exhausted one-off test approval. Historical receipts and
duplicate locks remain unchanged. After personal login, verify the saved
connection and obtain a concrete new test publication choice before a real send.

### Single Story link prompt, later owner refinement, 31 October 2026

The owner requested removing the old baked-in CTA text and using a short native
reading prompt, and asked whether the chain icon and typography can be changed.
Story now omits the old graphic button entirely rather than leaving an empty
black pill behind the separate native sticker. New jobs use “Læs artiklen her”.
Square/feed images retain their existing CTA. Existing approved jobs and receipts
retain their original labels, identities and locks; no existing post is resent.

In the actual earlier Business Suite inspection, no icon-removal or font-family
control for link stickers was found. Do not present the separate text tool's
controls as sticker customization. The new shorter native label is within the
observed 25-character limit. No custom iconless or custom-font clickable sticker
is claimed. Preview/download are the base image; Meta adds the interactive layer
only during connected Story publishing.

46 relevant store, route and runtime tests passed, as did scoped lint and diff
checks. Local visual fixtures confirmed the Story base has no graphic CTA and
the square base retains it. The separate hosted connection still needs the
owner's personal login before a real hosted publication can be verified. No new
Story has been published for this refinement.
