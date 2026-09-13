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
