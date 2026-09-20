# Article images: no visible text

Standing instruction from Frederik, 20 September 2026. Policy `apropos-text-free-v1`.

- No visible text, titles, dates, logos, lettering or watermarks in covers, mobile covers or body images.
- Prefer real text-free press stills over posters. Do not generate a new film scene.
- If the selected image contains lettering, the server performs one AI retouch and checks the result against the original. Preserve identity, expression, framing, clothing, lighting and colors. Never assume that retouching establishes image rights.
- Keep original bytes, actual source credit, source URL when available, and the AI edit receipt. Credits and descriptive captions belong outside the image, not on the pixels.
- AI pixels are composited only inside detected lettering regions, with colour/edge matching. Outside those regions the original photo is retained, preventing the model from redrawing faces. Every revised receipt is archived, and a rejected paid response is reused for deterministic repairs rather than ordered again.
- Cache inspection and edits by image bytes and policy version. Reopening or retrying must not create duplicate paid generations. Unknown provider outcomes require reconciliation, not a new order.
- Use the existing separate Image-gen budget and reservation accounting. No automatic regeneration cascade. If budget or verification fails, preserve work and report the specific problem; do not knowingly publish a text-bearing image.
- This is a forward rule, not permission for a paid backfill of all historical articles. Existing published articles are changed only when requested. The Reacher cover is explicitly requested.

Implementation: `lib/images/text-free.ts`; new Liv media and the shared CMS image preparation flow use it. Uploads or publications made directly in Webflow outside the app cannot be guaranteed by this rule.
