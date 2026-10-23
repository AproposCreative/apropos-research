# One.com Sendt-arkivering — 23. oktober 2026

## SORT / LIV-010

- SMTP accepterede mailen kl. 18:35:27.586 UTC. Dette beviser ikke levering til Scanbox.
- Den gamle akkrediteringssti gemte ikke den afsendte MIME. Den bevarede dog den personligt godkendte tekst, HTML/signatur, afsender, modtager, emne, Message-ID og SMTP-tidspunkt.
- Livs Apple Mail-mapping peger på `INBOX.Sent Messages`. Den tidligere arkiveringskode slog kun den bogstavelige sti `Sent Messages` op. Det forklarer, hvorfor den ikke fandt korrekt mappe. Den præcise historiske IMAP-fejltekst blev ikke bevaret i den gamle kvittering.
- Før reparation fandtes ingen kopi i de undersøgte Sendt-mapper. En kopi blev bygget fra de uændrede godkendte felter, kun til IMAP. SMTP blev ikke kaldt igen. Originale MIME-bytes kan ikke hævdes genskabt.
- One.com ændrede mailens bare LF til CRLF ved IMAP APPEND. SHA-256 for rekonstruktionen var `b7655fe8b138653344942130e79438b0f10c31e9d85cb040aa025256f89d3709`; SHA-256 efter RFC-linjeskift-normalisering er `eacf248302eb6ce830913ae71ac9761f15469ad2ed7d0945576def5c8b5bb32b`, præcis som IMAP-readback. Første reparationskvittering blev derfor fejlagtigt `unconfirmed`, men oprettede én kopi. Andet gennemløb læste den eksisterende kopi og markerede kvitteringen verificeret uden nyt APPEND.
- Produktionskvittering: `sentCopyArchived:true`, `sentFolderSync.status:verified`, mappe `INBOX.Sent Messages`, UID `36`, UIDVALIDITY `1748261062`, samme Message-ID `<d1da6308-2b92-75c3-6f05-992dc32a749a@aproposmagazine.com>`, `archiveSource:approved_draft_reconstruction`, `recipientDeliveryVerified:false`, `deviceVisibilityVerified:false`. Kontrollen fandt én matchende kopi.

## Rettelse og afgrænsning

- Almindelige One.com-mails, svar og SMTP-baserede akkrediteringer bruger nu samme MIME/SMTP/IMAP-grænse. MIME bygges én gang; SMTP-accept og IMAP-readback er separate statusser. Arkiveringsfejl sender aldrig igen.
- Den faktiske IMAP-sti findes ud fra ejerens valgte mappenavn. Readback accepterer One.coms dokumenterede LF→CRLF-normalisering, men ikke ændret mailindhold eller flere kopier med samme Message-ID.
- Nye akkrediteringer bevarer MIME privat før SMTP. Godkendelsen er fortsat personlig og versionsbundet. Reparation understøtter `mcp-`-ID på serveren og en versionsbundet 64-hex-kompatibilitetsnøgle til MCP-klienter med cachet skema. Reparation kalder ikke SMTP.
- En gammel mail uden bevaret MIME kan kun rekonstrueres til Sendt, hvis den godkendte tekst, HTML/signatur, identitet, Message-ID og accepttidspunkt er intakte og der ikke var bilag. Ellers returneres fejl i stedet for et gæt.
- En SMTP-accept er fortsat ikke bevis for modtagerlevering. Servermappe-readback er ikke bevis for, at iPhone allerede har synkroniseret; det kræver kontrol i Apple Mail.
- Den alternative legacy Resend-transport er ikke One.com SMTP og er ikke omfattet af One.com Sendt-garantien. Den personligt godkendte akkrediteringskanal kræver SMTP.

## Verifikation

- Isolerede tests for almindelige mails, svar, akkrediteringer, personlig godkendelse, mappevalg, dubletter, fejl, timeout/readback og reparation uden SMTP: 103 bestået i 6 filer.
- Lokal TypeScript-kontrol og produktionsbuild bestået.
- Commit `e823d4f7`, `a137031a`, `3edc0066`; produktion `dpl_CT9pVCFnxb1FnVA15o3JvHPdzRdt` på `ai.aproposmagazine.com`, READY og promoveret. Sundhedstjek svarede `{"ok":true}`.
- Live readback efter reparation dokumenterer SORT-kopien og opdateret kvittering. En ny ejer-godkendt end-to-end testmail for hvert flow er ikke sendt under denne reparation.
