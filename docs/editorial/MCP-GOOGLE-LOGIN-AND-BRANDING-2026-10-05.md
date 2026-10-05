# Apropos AI: Google-first connection and icon verification

## Scope

The owner reported that ChatGPT still displayed a generic icon and that the
connection flow foregrounded a password despite the team using Google login.
This release changes presentation only. It does not expand the owner-only MCP
pilot, change OAuth scopes, create/revoke grants, publish articles, clear provider
holds or buy AI work. Existing unrelated working-tree changes were preserved.

## Google-first login: implemented and live

- `ConnectionLogin` calls the existing `AuthProvider.signInWithGoogle`, which
  uses Firebase `signInWithPopup` and the same server-side account/access checks
  as the main application. A Google account does not need a separate Apropos
  password. Authentication remains separate from explicit MCP consent.
- Google is the primary, visible button. E-mail/password remains available in a
  closed disclosure, with password-manager autocomplete and no prefilled owner
  email. The owner-only pilot is stated plainly.
- Popup blocked, cancelled, network and access-check errors leave the form
  visible with specific Danish guidance. Duplicate submission is guarded.
- Production visual verification caught a missing `text-black` utility: the
  project theme defines a numbered black palette without `DEFAULT`, so the label
  inherited white on white. The repair uses explicit black; the isolated fixture
  now compiles the actual project theme rather than default Tailwind colors.

Verification:

- Full isolated suite on the main change: **345 files / 4,820 tests passed**.
- After the contrast correction: **19 focused tests passed**; TypeScript and
  scoped ESLint passed again. Safe build configuration passed before deployment.
- Real auth provider + connection component exercised locally with mocked
  Firebase/API: successful Google login reaches the separate consent screen;
  blocked/closed popup and denied access retain the form; focus revalidation
  retains the exact password input and disposable input value. No real password
  was used and no console errors were captured in the fixture.
- Production release `1acb2cbf205b63c06264427de3188f94b20e5608`, deployment
  `dpl_Hk1aAZAgALGwAHz4Bz57H9m1Am75`, verified READY with
  `ai.aproposmagazine.com` and `apropos-research.vercel.app` aliases.
- The user's production-domain session was already authenticated and still
  showed `Adgang godkendt`. It was not logged out for testing. The same production
  release's `apropos-research.vercel.app/connect/chatgpt` alias provided an
  isolated signed-out check: Google first, password disclosure closed, computed
  text rgb(0,0,0) on rgb(255,255,255). Screenshot:
  `/tmp/apropos-google-login-live-2026-10-05.png`.
- This verifies the deployed UI and simulated success/failure handling, not a new
  end-to-end Google identity/consent grant performed by the owner.
- Final-deployment Vercel error/fatal scan, 16:09:30–16:11:34Z, returned no
  matches. This short window is not a general uptime guarantee.

## Branding: server assets live; ChatGPT icon still unresolved

- Original approved white Apropos Magazine logo on black is served publicly as
  `/images/apropos-ai-icon.png` (256x256 PNG, 5,317 bytes), HTTP 200 and identical
  to the committed asset. SHA256:
  `cda9d8b404d95c7c907a965b12b3f288e74d5c813610a40f31c9f1cc0e7dbf33`.
- MCP `initialize` now includes title `Apropos AI`, website URL and the standard
  SDK `icons` field. Stable server name, identity, 36 tools and scopes unchanged.
  Protocol regression verifies the exact metadata. Protected-resource metadata
  reads back `resource_name: Apropos AI` from the production host.
- The existing ChatGPT plugin remains
  `plugin_asdk_app_6ac38ead40f881918d8a00144eb848bc`, with the same registered app
  `asdk_app_6ac38ead40f881918d8a00144eb848bc` and connected Primary owner account.
- Uploaded package 1.0.2 preserves `.app.json` and adds a portable root manifest
  with `extensions.com.openai.interface` logo/composerIcon/light/dark references,
  plus the compatibility manifest and actual PNG. ChatGPT accepted the update
  and displayed version 1.0.2, but **still showed generic icons** after reload.
  Package: `output/plugin-brand/apropos-plugin-1.0.2.zip`, SHA256
  `1e6698ff15912a3df48290f6c7548adb0f81e70d824f284e4ad3ec7e41d3e62f`.
- The existing app settings expose name, description and tool refresh, **no icon
  editor**. After `Opdater værktøjer`, the displayed plugin version reverted to
  1.0.0 and remained generic. The 1.0.2 package was restored afterward without
  another tool refresh. Do not claim MCP icon metadata or ZIP acceptance proves
  that ChatGPT renders the icon.
- Final visual readback still shows the connected Primary account and version
  1.0.2, but generic icons. Screenshot:
  `/tmp/apropos-plugin-logo-unresolved-2026-10-05.png`.
- The authenticated OpenAI Platform plugins page in the current organization
  offered new submission only; it did not list this private developer-mode app.
  No duplicate registration, public submission or new permissions were created.

The remaining issue is the private ChatGPT app's icon presentation/import path.
The supported in-place package formats, existing app settings, metadata refresh
and current developer dashboard have been checked. Further progress requires a
supported icon control for this existing app or clarification/correction from
ChatGPT. Recreating the connection or making a public directory submission is
not an authorized or proven solution to this branding problem. Preserve the
working connection and approved package; do not repeatedly re-upload or reset it.

Official package references inspected on 5 October:

- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/deploy/submission

No paid model requests, billing changes, CMS changes or team-access expansion
were performed. The broader Liv-delivery acceptance goal is not complete.
