# Store billeder: verificerede fund og lokal rettelse

9. september 2026. Apropos-adgang via Webflow virker nu. Siteinstruktionslisten er læst: de to registrerede instruktioner vedrører oprettelse/oversættelse af artikler; ingen af delene udføres her.

## Hvad Morningscore faktisk viser

1.825 store billedforekomster på 458 sider. I den konkrete diagnose for `/articles/nok-om-mig-mikkel-klint-thorius-rammer-plet-i-bremen` markeres to filer, begge afrundet til 0,5 MB: `05AproposMagazine_Random.webp` og Kurt Vile-thumbnail. Der blev kun åbnet diagnose; ingen AI-fix eller rescan blev bestilt.

Selvstændig HEAD-kontrol af alle 808 unikke Webflow-CDN-img-src i den tidligere offentlige sitemap-audit: 114 filer over 500.000 bytes. 17 filer har manglende størrelsesdata eller mislykket svar og må ikke regnes som problemfrie. Fire af auditens 812 unikke src ligger uden for denne CDN-afgrænsning. 500.000 bytes er vores eksplicitte analysegrænse, ikke en påstået nøjagtig Morningscore-grænse. Srcset, CSS-baggrunde og JavaScript-injicerede billeder er ikke udtømmende dækket af HEAD-listen.

Se `image-sizes.json` for samtlige resultater og `large-image-priority.csv` for prioritering. Sortering efter bytes × antal sider er et prioriteringssignal, ikke et estimat for faktisk trafikbesparelse; caching, trafik og srcset påvirker den faktiske effekt.

| Fil | Bytes | Sider i HTML-inventar |
|---|---:|---:|
| Ericka Jane Syd for Solen thumbnail | 1.631.816 | 236 |
| Fælles Apropos Random-billede | 538.438 | 445 |
| Torsdag Syd for Solen thumbnail | 896.780 | 236 |
| Sombr Syd for Solen thumbnail | 593.848 | 236 |
| Spider-Man thumbnail | 517.894 | 93 |
| Kurt Vile thumbnail | 533.872 | 80 |

Største enkelte fil i kontrollen: Turboweekend-thumbnail, 2.943.352 bytes, 14 sider. Musik i Gentofte-thumbnail fylder 2.597.054 bytes og White Lies 2.214.460 bytes. At en fil allerede er WebP eller hedder “2400w” beviser hverken passende størrelse eller faktisk opløsning.

## Reelt billedvalg i browseren

Artikelprøve på 1280 CSS-pixels viewport, devicePixelRatio 2:

- `.audio-player__artwork`: original på 3840×2160 vises 44×44; currentSrc er originalen på 538.438 bytes. Ingen srcset.
- `.desktop_thumb` for Kurt Vile: naturalWidth 2990, naturalHeight 2516; renderet cirka 373×249. Originalen hentes, ingen srcset eller sizes. Filnavnet siger “2400w”, men browserens faktiske mål er større.
- Samme korts `.mobile_thumb` er skjult på desktop (0×0), men har eager loading og en loaded currentSrc på 1200 pixels bredde. Separate img-elementer kan derfor koste et ekstra billeddownload på forkert breakpoint.
- Subscribe-modalens Apropos-billede er derimod skjult og lazy; currentSrc var tom i prøven. Dets rå src er stort, men det var ikke hentet i denne tilstand. Billedet har allerede responsive kandidater. Vi skal bevare denne forskel frem for at sidestille alle auditorigfund med faktiske downloads.

## Rettet lokalt

`public/podcast-player.js` og demoens faktiske artwork-img bruger nu den eksisterende Webflow-variant `05AproposMagazine_Random-p-500.webp` samt width=44 og height=44. Varianten er verificeret med HTTP 200, image/webp og Content-Length 49.052 bytes. Det er 90,89% færre bytes end originalen for denne standardkilde. Sociale preview-metadata og dynamiske episodebilleder er bevaret. Ingen nyt billedasset, komprimering af originaler eller CMS-write.

Dette er en lokal kodeændring, ikke en publiceret rettelse. Node-syntakskontrol og diff-kontrol består. Det tidligere Next-build er fra før denne simple statiske URL-ændring. Liv har bekræftet, at filen er urørt i deres opgave.

## Næste billedrettelser

1. Bevar desktop-originaler til store hero-visninger. Giv små artikelkort egne responsive kandidater og korrekte sizes. Brug picture/media eller anden verificeret enkelt-downloadløsning, så både mobil- og desktop-img ikke eager-loades på samme viewport.
2. Start med Ericka Jane, Torsdag/Sombr og Kurt Vile, fordi de genbruges bredt. Forbered mindre afledte filer efter visuel kontrol af motiv, crop og credits. Ingen overskrivning af kildeaktiver eller automatisk CMS-backfill.
3. Thumbnail-programmet bruger aktuelt `preserveDimensions: true` og et størrelsesmål på 600 KB; ved minimumskvalitet kan output stadig overstige målet. Det forklarer, hvorfor “optimeret” ikke er et størrelsesløfte. Ændr ikke globalt til lav opløsning, da samme felt også bruges som hero. Afledte kortbilleder er den rette afgrænsning at teste.
4. Efter en godkendt udgivelse måles currentSrc, overførte bytes, skarphed og beskæring på mobil/desktop, inkl. lydafspiller åben/lukket. Morningscore må først registreres som forbedret efter ny kontrol.

## Status på navigationens dimensionspilot

Den aktuelle Navigation-komponent er fundet og rå før-indstillinger gemt i `navigation-before.json`. Forsøg på at sætte søgeikonets verificerede 21×21 via attributes blev afvist: `width is a reserved attribute name`, ingen applied_keys. Readback bekræfter uændrede settings og tom attributes-liste. Tool-discovery bekræftede, at der ikke findes flere native dimensionsværktøjer i connectoren. Ingen Webflow-mutation lykkedes; mål skal derfor sættes via en understøttet Designer-kontrol. Der er ingen grund til at erstatte elementer eller ændre globale styles blot for at omgå denne begrænsning.
