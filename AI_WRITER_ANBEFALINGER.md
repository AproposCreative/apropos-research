# Anbefalinger: Bedst mulige løsning for AI-artikelgenerering

## 1. Timeout (implementeret)

- **Problem:** Klienten afbrød efter 3 min, mens editorial-pipeline (research + generation + kvalitet) kan tage op til ~5 min.
- **Løsning:** Klient-timeout for editorial er sat til **5 minutter** (300.000 ms), så den matcher serverens `maxDuration = 300`.
- **Vercel:** På **Hobby**-plan er max 10s per request – editorial vil derfor timeout’e. For fuld editorial skal I bruge **Pro** (max 300s) eller flytte den tunge kørsel til en **background job** (cron, queue, eller ekstern worker).

---

## 2. Tydelig progress til brugeren (anbefales)

Lige nu vises kun en generisk “Finder vinklen…” og en simuleret progressbar. API’en har allerede faser (prepare, web-search, advanced-research, generation, quality, format), men de bruges ikke i UI.

**Anbefaling:**

- **Kort sigt:** Vis faste tekster efter tid, f.eks. efter 15s “Søger kilder…”, efter 45s “Skriver artikel…”, efter 2 min “Finerjusterer kvalitet…” så brugeren forstår, at det tager tid og at noget sker.
- **Længere sigt:** Tilføj **Server-Sent Events (SSE)** eller **polling** fra `/api/ai-chat`, så serveren sender `progressId`-opdateringer (prepare → web-search → generation → quality → format). UI opdaterer teksten ud fra det, så brugeren ser den reelle fase.

---

## 3. “Ja” → kun titel + intro vs. fuld artikel (valgfri UX)

I dag betyder “Ja” til “Skal vi starte med en arbejdstitel og en indledning?”: generer titel + intro med **fuld** editorial pipeline (research osv.), hvilket er langsomt men kvalitetsrigt.

**Alternativ model:**

- **Fase 1:** “Ja” kalder en **kort** opgave: kun arbejdstitel + indledning (minimal eller ingen research, f.eks. 30–60s). Brugeren får hurtig feedback og kan justere.
- **Fase 2:** Eksplicit knap fx “Skriv hele artiklen” eller “Generer med research” starter den **fulde** editorial pipeline. Her forventer brugeren længere ventetid.

Fordele: Hurtigere første respons, tydelig adskillelse mellem “draft titel/intro” og “fuld artikel med research”.

---

## 4. Duplikeret AI-prompt i preview (vedvarende)

I ReviewPanel er der heuristik der skjuler duplikerede TOV-blokke. Bedre løsning er at **undgå duplikering i kilden**:

- I SetupWizard: Når I bygger `aiDraft.prompt`, brug **enten** den korte research-beskrivelse + tone-instruktion **eller** den fulde TOV-blok – ikke begge. Gem fx kun “research + MÅL + tone”, og lad den fulde forfatter-TOV kun leve i system-prompten på serveren, så den ikke lagres i `aiDraft.prompt`.
- Så kan ReviewPanel blot vise `aiDraft.prompt` uden ekstra filtrering.

---

## 5. Fejlhåndtering og genforsøg

- Ved timeout eller netværksfejl: vis en kort besked + knap **“Forsøg igen”** der sender samme besked (og evt. samme `chatHistory`) igen.
- Overvej at gemme `lastRequestPayload` (message + articleData + chatHistory) i state eller sessionStorage, så “Forsøg igen” ikke kræver at brugeren skriver igen.

---

## 6. Vercel / infrastruktur

- **maxDuration = 300** i `app/api/ai-chat/route.ts` kræver **Vercel Pro**. På Hobby vil lange requests blive afbrudt.
- Hvis I forbliver på Hobby: overvej at flytte den tunge generation til en **background flow** (trigger fra UI → job i kø → polling eller webhook når artiklen er klar). Så har brugeren ikke en åben request i 5 min.

---

## Opsummering

| Prioritet | Anbefaling | Status |
|----------|------------|--------|
| Høj | Klient-timeout 5 min for editorial | ✅ Implementeret |
| Høj | Vercel Pro eller background job til lange requests | Afhænger af jeres plan |
| Medium | Tydelige progress-tekster eller rigtig progress (SSE/polling) | ✅ Implementeret |
| Medium | Undgå duplikering af TOV i `aiDraft.prompt` | ✅ Implementeret |
| Lav | “Forsøg igen” ved timeout/fejl | Anbefales |
| Valgfri | Fase 1: titel+intro hurtigt → Fase 2: “Skriv hele artiklen” | UX-valg |
