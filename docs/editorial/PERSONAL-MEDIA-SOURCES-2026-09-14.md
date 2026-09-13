# Personal media-source repair

Local implementation, not yet deployed or browser-accepted:

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
