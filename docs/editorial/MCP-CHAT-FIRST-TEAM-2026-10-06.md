# Apropos AI: chat-first MCP og personlig teamadgang

## Godkendt leverance

Frederik godkendte den samlede chat-first-plan og teamadgang. Research,
tekst, SEO-forslag og illustrationer udføres i brugerens chat. Apropos er
arbejdsarkiv, billedlager, CMS og kontrolleret udgivelse. Chatabonnementet er
ikke en API-kredit: autonom Liv-drift og nødvendige serverkontroller er stadig
særskilte API-forløb. Ingen ny udbyder, budgetændring eller holdnulstilling.

## Implementeret

- MCP v7 (`2026-10-06-v7`), 42 værktøjer. De fem nye er
  `preview_submission`, `confirm_submission_action`, `get_image_brief`,
  `import_submission_image` og `get_submission_costs`.
- Et minimalt sort artikelpreview i chatten: hele teksten, cover og
  brødtekstbilleder, højst tre manglende valg ad gangen, målrettet rettelse,
  billedvalg og manuel statusopdatering. Detaljer/forbrug er under tandhjulet.
  Ukendt eller fejlet billedpreview stopper godkendelse. Linket er fallback
  for klienter uden MCP Apps, ikke den primære læseoplevelse.
- Prisaccept og udgivelse er to forskellige personlige knaptryk.
  Engangstoken sendes kun til appens metadata, ikke til modellens tekst eller
  structuredContent. Serveren kontrollerer bruger, OAuth-forbindelse, scope,
  levetid, artikelversion, formål og tidligere forsøg. En modelpåstand om
  godkendelse er ikke tilstrækkelig. Usikkert svar kræver status, ikke genkøb.
- Nye klargøringsforløb får serverfastsat `chat-final-checks-v1`. Manglende
  billeder skal tilføjes fra chatten, ikke genereres automatisk via API.
  Ledgeren tillader alene nødvendige visuelle/redaktionelle slutkontroller
  under det personligt accepterede reservationsloft. Image/audio/video-
  generation og skrivning afvises før transport. Eksisterende forløb ændres
  ikke stiltiende eller mister godkendelser/historik.
- Én fælles kanonisk billedprompt til eksisterende image-gen og MCP.
  `get_image_brief` returnerer den aktuelle stilreference som faktiske pixels,
  stilversion/hash og tekstafsnit. Film/TV afviser illustrerede filmstills.
  Personlighed/udseende kræver kilder; chattens faktiske promptanvendelse og
  billedlighed kan ikke bevises alene af et indsendt brief-ID.
- Native chatfiler importeres med original, hash og versionshistorik i
  privat lager, WebP-optimering, CMS-asset readback og afsnits-ID. Kun udvalgt
  cover/afsnit ændres. Kortlivede download-URL'er lagres eller logges ikke.
  DNS-pinning, hostallowlist, ingen redirects, raster-/størrelsesgrænser og
  timeout-reconciliation beskytter importen. Ukendte rettigheder forbliver
  ukendte; AI-illustrationer krediteres som illustrationer.
- Verificerede aktive `@aproposmagazine.com`-konti kan forbinde personligt,
  via Google eller eksisterende verificeret e-mail/password. Kontrol sker
  ved tokenbrug og igen før baggrundsudgivelse. Deaktiverede/tilbagekaldte
  konti nægtes. Hver bruger redigerer og udgiver egne indsendelser; byline
  giver ikke ejerskab. Delte CMS-artikler kan læses. Ejerens indstillinger,
  globalt forbrug og gamle Liv-handlinger er ikke åbnet for teamet.
- Forbrug pr. egen indsendelse viser registrerede trin/fejl/reservationer,
  ikke kollegers data, providerfaktura eller påstået abonnementsbesparelse.
- Versionsbundet CMS-kontrol, planlægning, uafhængig serverworker og offentlig
  readback er bevaret. Registreret publikation skelnes fra frisk live-verifikation.
  Ingen site-publicering, Instagram eller omskrivning af Livs leveringshistorik.

## Teknisk grundlag

[OpenAI tool/file-parameter-reference](https://developers.openai.com/plugins/reference),
[ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui) og
[MCP Apps 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
Ingen nye pakker installeret. Værktøjsmetadata er ikke en autorisationsgrænse.
Eksternt materiale behandles som indhold, aldrig som instruktioner.

## Lokal evidens

- 350 testfiler / 4.858 isolerede tests bestod 6. oktober med
  `RAGE_STORAGE_DIR=./tmp/vitest-rage`. TypeScript og fokuseret ESLint bestod.
- Produktionsbuild og sikker build-konfiguration bestod. Endelig deployment
  skal genbygge den eksakte pushed commit, ikke ucommittet checkout.
- Isoleret mobil-/desktop-widgettest: fuld tekst/billeder, skjulte detaljer,
  ét eksplicit slutkontrolklik, ingen automatisk bestilling eller publikation,
  ingen vandret overflow. Seneste skærmbilleder:
  `/tmp/apropos-mcp-widget-mobile.png` og `/tmp/apropos-mcp-widget-desktop.png`.
  Dette er en simuleret vært, ikke bevis for ChatGPT på en rigtig telefon.
- Regression omfatter personlig isolation, tilbagekaldelse, domæneangreb,
  scopes, versionskonflikt, udløb/dobbeltklik/uklare svar, billedoriginaler,
  afsnitsplacering, filmregler, importgenoptagelse og forbud mod betalt fallback.
- Skill-frontmatter valideres med installeret YAML-parser; Python-validatoren
  mangler PyYAML. Ingen ekstra afhængighed installeres af den grund.

## Accept, der kræver virkelig klient-/produktionsverifikation

- READY + eksakt SHA + produktionsalias og autentificeret MCP-readback.
- Ejer og kollega kan autentificere; eget arbejde læses, andres private
  indsendelser og ejerhandlinger afvises. Servicetest er ikke menneskeligt
  Google-login eller dokumentation for appdeling på alle abonnementer.
- Faktisk ChatGPT-app opdager de nye værktøjer og viser hele previewet.
- Rigtig chatgenereret fil importeres i et valgt redaktionelt forløb; kun
  dokumenterede, tilladte hosts accepteres. Ingen opdigtet filreference.
- Ejer og kollega gennemfører hver et rigtigt mobilforløb med personligt
  pris-/publiceringsklik og verificeret liveside. Der købes ikke prøve-AI
  eller publiceres en testartikel for at få dette punkt til at se grønt ud.

Ovenstående eksterne accept må ikke markeres færdig ud fra mocks eller deploy.
Livs uafsluttede hver-anden-dag-mål er en separat leverance.

## Produktionskontrol 6. oktober

- SHA `9c7efd6655cf277c3beea416a65aa9a93a6566cb` pushed på den eksisterende
  branch og deployet fra præcis Git-ref som
  `dpl_HwCmhVqNJ9PU8RdWoKbXdujdbQaW`. READY og faktisk alias
  `ai.aproposmagazine.com` kontrolleret igen i servicetesten kl. 10:17Z.
- Personlig serviceautentificeret PKCE-test gennem produktionsendpoints for
  Frederik og Casper: begge gav MCP v7 og 42 værktøjer. Anonym adgang afvist.
  Casper kunne liste egne indsendelser (nul), men blev afvist ved Frederiks
  private Fire & Ice og ejerens `get_liv_status`. Ingen kollegas brugerbrowser
  eller password blev brugt. De to testgrants blev særskilt tilbagekaldt;
  eksisterende ChatGPT-forbindelser blev ikke tilbagekaldt.
- `preview_submission` returnerede den rigtige Fire & Ice-artikel med ni
  tekstblokke, gemt identitet/revision og providerblokering. Ingen prisaccept
  eller publikation blev muliggjort. Shared ledger fik nul nye calls, og
  provider-hold-data var uændrede før/efter. Ingen artikel/CMS-ændring.
- MCP App-resource og native-file-parametermetadata blev læst via faktisk
  `/mcp`, ikke blot lokal funktion. Faktisk filimport og menneskeligt
  publiceringsklik er fortsat særskilte acceptpunkter.
- Runtime error/fatal-scan 10:15–10:19:12Z fandt kun den tidligere kendte
  `MaxListenersExceededWarning` på `/api/podcast/public/episode`, HTTP 200.
  Ingen MCP-error/fatal i det returnerede vindue. Dette er ikke en garanti
  for fejlfri drift eller en rettelse af podcast-advarslen.
- ChatGPT-appens værktøjer blev opdateret i brugerens eksisterende forbindelse:
  26 read + 16 write, inklusive alle fem nye værktøjer. Refresh regenererede
  metadata-pakken som 1.0.0. Den uændrede godkendte 1.0.2 brandingpakke blev
  derfor genindlæst; UI bekræftede “New version uploaded” og 1.0.2.
  ZIP-hash `1e6698ff15912a3df48290f6c7548adb0f81e70d824f284e4ad3ec7e41d3e62f`.
  Ingen nye scopes eller ændring af udvidelsens filadgang. Det løser ikke
  nødvendigvis ChatGPTs særskilte generiske ikonvisning.

## Faktisk ChatGPT-klientkontrol 6. oktober

- Brugerens eksisterende Apropos AI-forbindelse viste hele den gemte Fire & Ice-
  tekst direkte i ChatGPT, inklusive sidste afsnit, byline og kategori. Logoet
  vises i det sorte artikelpreview, og detaljer er under tandhjulet.
  [Kontrolchat](https://chatgpt.com/c/6ac4cb68-2490-83eb-94b7-44b85b6eb623).
  Skærmbillede: `/tmp/apropos-mcp-chatgpt-preview-live.jpg`.
- Live-værtsbroen blev også prøvet: et klik på “Opdatér status” hentede
  samme artikel igen, hvorefter knapperne blev aktive. Tandhjulet viste og
  skjulte detaljer. Ingen tekstændring, prisaccept, billedbestilling eller
  publicering blev udført.
- Serveraudit for den første chatrespons: `list_submissions`
  `95e5848b-47fe-4aba-b208-cf547f7cbce7`, 139 ms; `preview_submission`
  `f7747e97-ba3f-4c5d-8180-dc0fbe422d8f`, 1.270 ms, og
  `c5750247-d6ed-4345-9eb3-4994b3a298cf`, 1.218 ms. Alle OK, v7 og
  `paidAiAllowed=false`. ChatGPT viste “Worked for 28s” og kaldte preview to
  gange. Begge svarede korrekt, men klientens dobbeltvisning er ikke en
  dokumenteret one-call-oplevelse eller en garanteret svartid.
- Klientens eksisterende “Enforce CSP for custom apps” var slået fra, og
  previewet bar værtens “CSP off”-mærke. Indstillingen blev ikke ændret.
  Resource-deklaration og serverkontroller er testet, men dette klientforsøg
  dokumenterer ikke håndhævelse af værtens CSP.
- Fire & Ice er et eksisterende `legacy-preparation`-forløb med bevaret
  historisk prisoverslag og manglende billeder. Det blev ikke stiltiende
  flyttet til den nye slutkontrolpolitik. Det faktiske preview bekræfter
  derfor tekstvisning/status, ikke en gennemført ny billedimport eller
  afregning under `chat-final-checks-v1`.
- Produktion og faktisk desktop-preview er verificeret. Rigtig native
  chatbilledimport, menneskeligt Google-login for kollega samt komplette
  mobilforløb med nødvendig prisaccept, publicering og offentlig readback
  står fortsat åbne. Provider-holdet er uændret; der købes ikke testkald for
  at lukke disse acceptpunkter. Intet fuldt automatisk Liv-forløb er bevist.
