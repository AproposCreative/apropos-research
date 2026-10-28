# Review typography and requested Ringo title

Owner request: no long dashes in any review; change this book headline to
"Boganmeldelse: Nogen der kender nogen". Both U+2013 and U+2014 are covered.
The old prompt and preflight prohibited only U+2014; this headline used U+2013.
ChatGPT-first human-review submissions previously had no punctuation blocker.

Shared rules now reach Writer, Liv, MCP editorial context and submit workflow.
The shared checker examines visible text, decoded HTML entities, captions,
image alt text, metadata and social subtitles. URLs and normal hyphens remain
unchanged. It reports field names and never silently rewrites prose.
New review submissions cannot proceed to preparation with these characters;
CMS verification also blocks publication even if expected text matches CMS.
Writer diagnostics and metadata/quality regression screening report them too.
Post-publication SEO writes also reject new long dashes in review metadata;
this prevents a later SEO proposal from reintroducing the problem.
Historical published snapshots are not rewritten or retroactively unapproved.

The existing published Ringo item `6ae1f9da0e01d3d2ff34859f` was corrected through
the existing CMS lease and metadata-correction receipt pattern, after confirming
that live and staged fields matched. Only `name` and `seo-title` changed.
Receipt: `editorialMetadataCorrections/ringo-title-owner-20261028`.
Public HTTP 200 verified the new H1, title and Open Graph title. All other CMS
fields matched the before snapshot, including slug, images, body and rating.
Original submission approvals remain historical; no new personal consent was
fabricated. Local evidence: `output/ringo-title-{before,after}-20261028.json`.

Validation: 232 distinct tests passed across review typography, submission,
worker, publication, CMS readback, metadata and quality suites. Type check,
security config and whitespace checks passed. No paid AI or external mail.

Release: `a9ec38f68a8aadbeb0d56e78b7a11887d0d5b787`, MCP v61. Production
`ai.aproposmagazine.com` promoted to READY `dpl_B2Z6WdLquN3fkGUeZ9eAJcFoW9Xu`;
direct Vercel metadata confirmed the source SHA. Unrelated journal edits were
not included in code commits or deployment output.
