---
name: apropos-edit-copy
description: Ret eller forkort bestemte dele af en Apropos-artikel med før/efter-preview, versionskontrol og bevarede billeder via Apropos MCP.
---

# Ret teksten

Hent `get_workspace`. For en CMS-artikel bruges `open_article` med den aktuelle
workspace-revision; eksisterende privat arbejde arkiveres, CMS ændres ikke.
For kontrolstoppet Liv-tekst bruges `get_liv_work` eller `get_saved_writing` og
edit_liv_checkpoint/edit_saved_writing, kun hvor de understøtter stoppet.
Opret ikke en ny run-identitet for at omgå kontroller.

Hent `get_editorial_context`, section `structure`, hvis artikeltypen/strukturen
ændres; section `voice` hvis stemmen ændres. Én rettelse er ikke en ændring af
de generelle regler. Længde afhænger af type og bestilling; anvend ikke Livs
automatiske længdekrav på enhver importeret boganmeldelse.

Brug `preview_copyedit` med entydige before/after-passager. Vis ændringen og
brug samme previewHash i `apply_copyedit` efter brugerens ændringsbestilling.
En afbrudt apply kan gentages med samme input/hash. En versionskonflikt kræver
frisk læsning, aldrig blind overskrivning. Bevar fakta og selvstændigt sprog.

Dette tekstflow bevarer cover, indlejrede medier, alt-tekster og billedkrediter.
Billedændringer kræver en særskilt bestilling/understøttet mediearbejdsgang.
Ret kun bestilte felter. Kør `review_draft` på den nye revision og gem eventuelt
med `save_webflow_draft`. Læs `get_save_status` efter timeout. CMS-gemning er
staged, ikke publikation og ikke en ny kvalitetsgodkendelse.
