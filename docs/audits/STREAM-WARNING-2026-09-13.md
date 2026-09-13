# PassThrough listener warning investigation

Production evidence: `LIV-DAILY-VERIFICATION.md` and
`DEPLOY-RECEIPT-e93d604.md`. The warning appears during successful HTTP 200
podcast lookups and appeared on the morning publication route. No failure or
memory-growth evidence is established by the warning alone.

Source trace: public episode -> findPublicEpisodeBySlug -> readPodcastManifest
-> Google Cloud Storage file.exists()/file.download(). No application PassThrough
or listener-limit override was found on that path. This is a candidate dependency
path, not an established cause.

Local reproduction on September 13 used the installed @google-cloud/storage
package against a loopback-only fake HTTP server, useAuthWithCustomEndpoint=false,
no credentials, no retry and no production data:

- Three sequential JSON downloads with validation disabled: zero warnings.
- Three sequential JSON downloads with default validation: zero warnings.
- Twenty concurrent gzip downloads, default validation, each decoding 100,028
  bytes: zero warnings.

All local servers and connections closed afterwards. These negative experiments
do not prove production is healthy or rule out the library under real cloud
conditions. They do rule out claiming that this simple local download path
reproduces the symptom. No production validation was disabled and no listener
limit increased. Next useful evidence is a warning stack from the affected Vercel
runtime, with secrets/URLs excluded from retained diagnostics. Do not deploy an
unrelated dependency upgrade or suppression as a purported fix.

## Production diagnostic evidence, 17:07 UTC

Release c9e9c2a on dpl_E28xYpzjxqg5HnJHfaydh9adDYmW produced both sanitized
error/close listener diagnostics during a single read-only public episode lookup.
The request completed HTTP 200, ok=true, found=true, CDN MISS at
2026-09-13T17:07:51.487Z. No generation or publication was invoked.

Both stacks end in `.next/server/chunks/_0f7hb0y._.js:30:659`, via Node's
internal stream pipeline. The existing local chunk with that exact filename
contains the corresponding pipeline call. Its source map resolves to
`node_modules/teeny-request/src/index.ts:284:18`, piping a response body into a
PassThrough on its response event. This identifies a concrete dependency call
site; it does not yet prove the cause of accumulated listeners or memory growth.
The local chunk match is not an independent download of the production artifact.

Next: inspect the installed teeny-request streaming lifecycle and its Google
Storage caller before changing any dependency or pipeline behavior. The earlier
empty log query was superseded by this actual observed warning, not treated as
proof that the warning disappeared.
