# Native image workflow comparison — 14 October 2026

## Conclusion

The documented successful case is **Klubkultur, interactive v20 on 11 October**,
not a demonstrated v29 native generation. The barsel briefs were produced on
**v28**, before v29 was released. The later, repeated failed attempt was reported
after v29, but did not obtain a fresh brief or reach an image import.

There is a demonstrated **workflow discontinuity**, not a proven regression in
the canonical prompt builder or style file. The latest saved barsel cover brief
still requests the child/playhouse, not the later requested selfie portrait.
Both saved body briefs are for article revision1, while the article is revision2.
The successful and unsuccessful cases use the same style identity/hash and v1
handoff contract. The relevant builder/reference code is unchanged between v20
and the pre-v29 source. The existing server already rejects stale imports.

The exact native input and failed output are not available through the inspected
records. Therefore the precise cause of the collage/text output remains
**unproven**. A Work assistant's admission that it improvised is a self-report,
not an independently observed native invocation. Do not claim that the generator
definitely ignored the reference, or that correcting a brief guarantees quality.

No new engine, production control, prompt change or release was justified by this
comparison. Three focused regression tests were added. The existing v30 safety
stop remains in force; it is **not** a repair of native image production.

## Evidence compared

| Property | Successful Klubkultur | Barsel failure |
| --- | --- | --- |
| Submission | `22240d9eb65f22e81965d4b5e16f62b50647487c1b1c1d2caf77d01088caac08` | `546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171` |
| Actual server version during briefing | v20, 11 October | v28, 14 October |
| Workflow | Interactive local native generation; three separate calls | Work chat, four subject photos and subsequent portrait request |
| Briefs | Cover rev2, body1 rev3, body2 rev4; refreshed after each attachment | Initial cover/body/body rev1; only child/playhouse cover refreshed for rev2 |
| Style | `apropos-2026-09-14-v1`, expressive | Same version and hash |
| Prompt | Single scene, no collage/panels/lettering/logos/photo/3D | Same prohibitions already present; not a magazine-layout request |
| Actual style at MCP boundary | Recorded image-content handoff; saved canonical prompt | Successful brief calls and same image-content server implementation; raw response not retained here |
| Subject originals | Not needed for the anonymous conceptual scenes | Four chat attachments exist; zero MCP `imageReferences` records |
| Generation report | Exact canonical/effective prompt strings match, actual reference reported | No saved report or import receipt for the failed output |
| Output | Three original PNGs, separate images, attached and CDN-verified | User/assistant report collage and text; output file not available in the read result |
| Independent hidden-input proof | `exactPromptExecutionVerified=false` | Unavailable |

### Successful original evidence

Preserved files and report:
`output/liv-2026-10-12-native-images/`,
`docs/editorial/LIV-NATIVE-IMAGE-TEST-2026-10-11.md`.
The original brief JSONs record `nativeTool=image_gen`, the immediately preceding
actual MCP reference via `num_last_images_to_include:1`, and
`prompt===effectivePrompt`. These are client-side records, not independent proof
of hidden provider execution. Original PNG/import/CDN evidence is separate.

Fresh read-only CDN verification at **2026-10-14T14:05:41.090Z** found all three
originals HTTP200, `image/png`,1536×1024, matching retained bytes and hashes:

| Role | Bytes | SHA256 |
| --- | ---: | --- |
| Cover | 3,108,223 | `eda0c708a6eec72f5310379b88e7542a29af0bf4a30e824f398a42ae08551eb9` |
| Body1 | 3,184,558 | `d069b8847d9786ea6547e7260a62489a01eff9622ef402c43f6296e46a995c29` |
| Body2 | 2,949,432 | `294d67dbfca0d89cadf60a044c0444cf33db28d716fa220e379a00c6cacf6633` |

Cover/body1 were visually inspected in this diagnosis: separate illustrations,
not article layouts or multi-image panels. This is an agent assessment, not a
new human quality score. The saved verifier's `noPublication` field describes its
old preview receipt; it must not be read as the article's current status. The
article was personally approved and published on 12 October, outside this task.

The unchanged actual style JPEG has415,373bytes,1080×1350 and SHA256
`0ef077580da7c9ed5b4c64a6973acc3dde536af0bb7a40776f45bf59c5bcff01`.
It was decoded, hashed and viewed. `git diff 945429da 43198041^` has no changes in
`chat-image-brief.ts`, `prompt.ts`, `styles.ts` or `style-config.ts`. The MCP result
adapter in both versions returns the full brief text plus an inline image block.
This rules out a code difference in those specific components, not every host
or model difference.

### Barsel timeline and bindings

All times below are UTC on14October (add2hours for Copenhagen).

- 12:08:53.984: article created, revision1.
- 12:09:08.113: initial cover brief saved.
- 12:09:25.633 / .753: two revision1 body briefs saved.
- 12:13:39.642: article changed to revision2 before this diagnosis.
- 12:14:05.811: stale anchor rejected with `mcp_submission_anchor_changed`.
- 12:14:21.061: valid revision2 **child/playhouse** cover brief saved:
  `86095babd9c3b915822fd26a51aef389f5fec89115af4d2cba5f5a22d93421b9`.
  Prompt hash `52ba658d335970a94adb9de2d40d0bfcda230c8da8734298a77d76296762632b`.
- 12:53:01: v29 contract verification completed on a **different art submission**;
  the four negative import fixtures at12:52:56–12:53:00 are not barsel imports.
- 13:18:43 /13:18:46: owner audit records status/workflow reads onv29.
- 13:19:49.265: Work user asks for the four pictures and specifically their own
  portrait as cover; the turn has four original photo attachments.
- 13:25:03.995: user reports the repeated wrong output. The assistant admits it
  did not fetch a fresh portrait brief and says it produced a collage again.

Read-only Firestore audit on14October14:09:56Z covered12:00–13:26:35owner rows,
limit500, not truncated. **Zero MCP calls were recorded between13:19:49 and13:26.**
All four durable barsel briefs predatev29. No later portrait brief, source-photo
registration, import or generated-output receipt exists for this article.
The audit deliberately does not contain tool parameters, so it cannot attribute
every owner operation to an article; the durable per-submission records provide
the article bindings. Absence from the journal is not proof of hidden native
input or a tool call that never reached Apropos.

Success-window audit11October16:00–18:00 had21owner rows, not truncated:
briefs17:30:44.440 /17:32:37.951 /17:33:48.194 and successful imports17:32:06.078 /
17:33:21.300 /17:34:51.828, allv20 and `paidAiAllowed=false`.

### Original subject photos are not lost

The supported read of “⭐ Apropos – Redaktion · START HER” returned four original
chat attachments. All decode as JPEG. They were read locally, **not registered,
imported, transformed or sent to a generator**:

| File | Bytes | SHA256 |
| --- | ---: | --- |
| IMG_3609(1).jpeg |333,653| `357d43450d4746dc85542aabbade76fe8c43b88ff5511e9a18d95d557f7de407` |
| IMG_3611.jpeg |344,776| `2d897ff197582bd1cf28b398d687bae7e62a5254058955ce187cb0711fed8f2b` |
| IMG_3614(1).jpeg |561,859| `a424704d14d94feaf91da40bb5a4e4d5c9a1a063c5b7ca33cab7b406cdb608a6` |
| IMG_3617.jpeg |614,572| `690d2f3b6f288210f4b69ed1381c6ef86132f10cc0c9b3b15f6737936733fe6f` |

The fourth image was visually checked against the requested sunglasses/black
jacket portrait. The repository contains no new copy of these private photos.
Zero retained MCP references does **not** mean the user failed to upload photos.
Likewise legacy v1 briefs did not retain style bytes in a vault; that absence
does **not** prove MCP failed to return the actual inline style image.

## Evidence boundary and smallest next step

The supported Work read returned recent text and user attachments, but no native
call arguments or failed generated file. A read-only browser attempt was logged
out and closed; native app inspection was not permitted. No login/session or
alternative endpoint workaround was attempted. Do not infer output dimensions,
model, reference order, revised prompt or actual dispatch payload from prose.

OpenAI's [native image documentation](https://learn.chatgpt.com/docs/image-generation)
describes multiple reference images and distinct style/subject roles. It does not
supply an execution receipt for this Work attempt. The
[plugin reference](https://developers.openai.com/plugins/reference) describes the
plugin's own tool input/calls; it is not this missing native-generation trace.

Before another image attempt, obtain a supported observation of the actual native
handoff (prompt, ordered image inputs and output association), or an explicit
owner revision of the independent-input-verification requirement. Do not weaken
that requirement automatically. A screenshot/output download alone helps assess
the failure but cannot prove the input. Under currentv30, all new native generated
imports remain blocked even when a fresh brief is otherwise complete.

Once the integration is legitimately resolved, reuse the original four subject
photos and the current article, bind a **new portrait-specific** cover brief and
separate current body briefs to their actual photos, and run only the explicitly
authorized single-image trial. Do not reuse the child cover brief as a portrait,
combine all requested illustrations or reconstruct a generation report afterwards.
No trial is authorized or performed by this diagnosis.

## Tests and production scope

Only tests and documentation changed:

- `test/mcp-protocol.spec.ts`: exact prompt and ordered separate style/subject
  image blocks survive the MCP response adapter. A protocol fixture, not native
  host execution evidence.
- `test/mcp-chat-image-import.spec.ts`: changed cover intent produces a distinct
  brief, preserves article/history and the known-good style bytes; refreshing a
  cover never silently upgrades obsolete body briefs, which the import rejects.
- Existing unmocked `test/mcp-image-preflight.spec.ts` continues to prove the stop.
  Generated transport tests still explicitly mock the unavailable native bridge;
  they do not prove production generation works.

Final targeted run14October16:14Copenhagen: **3files /124tests passed**, including
3new tests. TypeScript, changed-test lint and diff checks passed. Initial run had
one test expecting the wrong rejection code; the existing early content-hash
check correctly returned `mcp_submission_brief_changed`. Only that expectation
was corrected. No application fix was needed. No full suite or paid test rerun.

Fresh connected MCP status and Vercel alias read confirm existingv30 source
`ebd062ba9edbea0f55e031ea100a55e8ad170d03`, deployment
`dpl_D8wTmy1zu8y17GnCdpwHQLWkonN7`, READY. **No new deployment**, new tool or
connection refresh is required for this diagnostic/test-only follow-up. Earlier
v29/v30 discovery refresh guidance remains applicable to already-stale clients,
but is not a fix for bypassing the workflow or the unobservable native input.

The live barsel article remains revision2, draft/awaiting_preparation, content hash
`a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846`, with four old
briefs, no imports, no generated failure receipts, no stored subject references,
no personal approval and no CMS article. No article content, original, approval,
provider hold, allowance, reservation or budget was changed. No generation or
publication occurred.

Final durable readback at **2026-10-14T14:14:59.005Z**:

- Article row hash `148d89bd63ddbe80c3ea8d814e76fc9f6ae217a5c26b82cacad09f6958e32d9f`
  equals the14:06:06.841Z diagnosis snapshot.
- Full article/brief/reference/asset/history/approval state hash
  `6db07e7ade7d2eb3bfcb54351b71a55f1f863f7e4d241ef127e7d5bdb41fbee6`
  equals the earlierv30 baseline.
- Financial state hash
  `e3b2d498e807ab1cba45f4ca156ce81e5eb15d5b71ea496457fc31da07b69101`
  equals that baseline as well. This is not a provider balance check or a claim
  that ChatGPT subscription usage is free.
