# Personal media-source repair

Implementation and isolated browser acceptance; deployment recorded separately:

- POST respects an explicit boolean enabled choice; PUT persists and returns it.
- Omitted enabled retains the existing setting. Invalid types are rejected.
- Disabling an unchanged endpoint works without a remote fetch; activation and
  changed URLs still require the existing safe cached source validation.
- SourcesPanel uses authenticated reads/writes and checks HTTP success. Failed
  loads no longer manufacture four active default sources. Unsaved suggestions
  are off and explicitly distinguished from server records.
- Contacts change only after a matching server response. Uncertain writes show
  an error and require list refresh before another toggle. Canonical returned
  IDs replace preset IDs. Creation no longer depends on addedAt heuristics.
- Panel is keyed by UID; stale reads and disposed-account responses cannot
  update the next user's view. Deletion no longer disguises HTTP failure.
- The count says selected sources and explains that toggles are not uptime.

Tests: 10 focused route tests passed; typecheck and diff check passed during
implementation. Before release: browser acceptance covering reload, missing
source creation, rejected/uncertain saves, account switching and empty/error
states; rerun typecheck/build after final edits. Personal research consumption
and older MediaContext state remain separate integration work, not proven by
these controls. No production source choices changed and no AI calls made.

Browser acceptance follow-up: real SourcesPanel in StrictMode at 390x844 with
isolated auth/API. Created Soundvenue from an unsaved suggestion; reloaded and
confirmed enabled state plus canonical ID. A failed PUT retained the prior state,
showed an error and disabled retries until readback. Failed GET showed zero
switches rather than fake defaults. Held account A's read, switched to B, then
released A: B retained its empty selection. All requests used matching fixture
account tokens, no uncaught errors and no horizontal overflow. Screenshot
inspected. Fixture is scripts/verify-personal-sources-ui.mjs. This proves the UI
against a controlled transport, not live publisher availability or research use.

## Production release and consumption audit

Release `18fc7b4f6158559895b389028b7db9aaf30aca03` is READY at
`dpl_7oyxqQbCaD2FNzMuWH6ve65xXNBA`, aliased to ai.aproposmagazine.com.
Production page returned 200 with the selected-source label and explicit save
failure message; anonymous personal-source GET returned 401. Build passed with
nine existing tracing warnings. Live personal choices were not changed.

Follow-up source tracing found a remaining functional gap:

- `app/api/ai-chat/route.ts` builds its research query from topic, platform and
  category, then calls getWriterResearch without loading personal mediaSources.
- `lib/ai-chat/research-cache.ts` caches by credential digest, query and options;
  a source-policy fingerprint must be included when preferences are integrated,
  otherwise old evidence could survive changed choices.
- `lib/research/service.ts` currently supports no source-policy option. Merely
  changing the panel or local MediaContext will not govern research transport.
- `lib/getMediaSources.ts` deliberately reads sharedMediaSources for system/Liv
  ingestion. Do not replace this with a colleague's personal collection.
- Legacy MediaContext has separate unscoped local selection state, not the
  authoritative personal-source choices. This remains part of privacy cleanup.

Next implementation must connect authenticated own-user source policy to the
Writer's existing research path, include it in cache identity, and cover both
primary and fallback providers. Test excluded sources cannot enter generated
context (not only the displayed citation list); preserve primary-source fact
checking and do not add a second paid search by default. Keep Liv's shared
research path independent. Until that integration is verified, the released
panel is source configuration, not proof that Writer obeys its selections.

## Research integration checkpoint (local, not deployed)

Writer now loads authenticated personal mediaSources before research and passes
a deterministic normalized preferred/excluded domain policy through the existing
cache options. Internal calls without Firebase identity load no personal policy;
shared Liv ingestion is unchanged. Storage errors stop the operation rather than
silently losing preferences. Up to 100 personal records, no silent truncation.

The existing service attaches the preferences to both primary and fallback
queries. Returned evidence citing excluded domains/subdomains is discarded as
a whole, including its generated context. Primary sources remain allowed and
enabled publishers are preferences, not an exclusive whitelist. No new search
stage or retry loop was added. Thirty mocked policy/cache/provider/storage tests
passed; no paid calls.

Remaining before release: service receives provider results after source-count
truncation, so exclusions must additionally be checked against each provider's
full evidence before truncation. Query instructions alone are not proof of
provider-level domain exclusion. Audit uncited/mixed context and prior article
research reuse; run Writer route integration and full regression/build. This
checkpoint is useful wiring, not a completed enforcement guarantee.

Full-evidence follow-up: both providers now receive sourcePolicy and enforce it
against their complete returned source sets before applying maxResults. Added
tests where the excluded URL is after the visible limit, for both providers.
Full isolated regression passed: 3,382 tests in 232 files; typecheck passed.

Remaining acceptance finding: build-system-prompt.ts independently includes
previously selected wizard research and editorial dossiers. This older supplied
evidence does not currently carry/enforce the new source-policy decision. It must
not be silently discarded from saved work or advertised as filtered. Define and
test its use when preferences change before claiming all Writer context obeys
exclusions. New search enforcement does not prove that the provider never
consulted an unreported source; the installed SDK exposes allowed_domains only.
No deployment of the research-policy changes at this checkpoint.

Saved-context follow-up: Writer now builds a prompt-only article view under a
nonempty exclusion policy. It omits old researchSelected and editorialResearch
auto-evidence segments, while preserving all stored data, article text, notes,
history and the original topic used for fresh research. With no personal
exclusions the prior behavior remains unchanged. This deliberately does not
rewrite user-provided draft text or conversation history, nor claim a source
purge of those materials. A mutation-preservation test was added. Full isolated
regression: 3,383 tests / 232 files passed; typecheck passed. Production build and
release verification are separate from this recorded local result.
