# Rollback-plan

## GitHub/kode

- Baseline: commit `417c670` på `main`.
- Arbejdsbranch: `codex/seo-aeo-geo-audit-2026-08-03`.
- Ændringer leveres som små commits og pull request; `main` ændres ikke direkte.
- Rollback før merge: luk PR eller revert det enkelte commit på branchen.
- Rollback efter merge: opret et eksplicit revert-commit; brug ikke hard reset.

## Vercel

- Baseline production deployment: `dpl_9ujAKWuZmyWaEgNoSbEEmS19ehGN`.
- Baseline status: `Ready`.
- Nye kodeændringer skal først verificeres som Preview deployment.
- Ved regression stoppes promote/merge. Efter production merge kan den kendte baseline-deployment promoveres igen fra Vercel, eller merge-committen kan revertes og deployes.
- Miljøvariable ændres ikke som del af første implementeringsfase. Hvis det senere bliver nødvendigt, dokumenteres navn, scope og tidligere tilstedeværelse — aldrig secret-værdien.

## Webflow CMS

Før hvert item-write gemmes:

- timestamp
- site ID, collection ID, item ID og locale ID
- `lastUpdated` og `lastPublished`
- alle felter, der skal ændres, med deres eksakte før-værdi
- planlagt efter-værdi og årsag

Efter write udføres readback. Hvis readback afviger, stoppes batchen. Rollback er en PATCH af de gemte før-værdier til samme item og locale, efterfulgt af ny readback. Publicering sker separat og aldrig automatisk under audit.

## Webflow page settings, schema og custom code

- Hele den eksisterende blok gemmes før en erstatning, fordi Webflows setter erstatter hele feltet/blokken.
- Page-level JSON-LD rulles tilbage med den eksakte tidligere `jsonLdSchema` eller `rawJsonLdSchema`.
- Site/page freeform code rulles tilbage med den eksakte tidligere head/footer-streng.
- Full-site publish må først ske efter staging/preview-validering og et eksplicit kontrolpunkt.

## Sitemap/indexering

- Før ændring gemmes `includeInSitemap` pr. page/item/locale.
- Rollback sætter den tidligere boolske værdi tilbage og verificerer generated sitemap efter publish.

## Nødstop for eksisterende automatisering

- Slå automatisk SEO fra i Settings eller med `SEO_ENGINE_AUTO_OPPORTUNITY_OPT=false`.
- `WEBFLOW_AUTO_SEO_ENGINE=false` stopper automatisk empty-fill.
- In-flight jobs kan afslutte; history/version records bruges til manuel rollback.

