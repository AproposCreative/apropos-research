# Apropos image references

Version: `apropos-2026-09-14-v1`. Supplied by Frederik for this project.
These files are bundled with the server, not fetched from Dropbox at runtime.

- `references/expressive-v1.jpg`: supplied `aproposcolorstyle.jpg` (Expressive folder).
  SHA-256: `0ef077580da7c9ed5b4c64a6973acc3dde536af0bb7a40776f45bf59c5bcff01`.
- `references/minimal-v1.webp`: supplied Gorillaz/Roskilde illustration (Minimal Drawing folder).
  SHA-256: `b93ed5de8b27684cfb488e7c1aa2567e9f9761152a5c5420b1cd426af89cdd10`.

Use as style references only, never copy their subjects into unrelated articles.
Common locked instructions live in `lib/image-gen/styles.ts` and are also used
by Liv. Only the verified owner may add workshop-specific directions or a new
reference through `/api/image-gen/styles`. Those changes create immutable
Firestore style versions and content-addressed private reference assets.
User-supplied references are not a claim of third-party image licensing.
