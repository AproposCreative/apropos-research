# AI Writer for Apropos Magazine

En AI-drevet skriveoplevelse til Apropos Magazine's redaktionelle platform.

## Funktioner

### Venstre Panel - Noter og Prompts
- Skriv kontekst, noter og artikel-ideer
- Quick action knapper til artikeltemplates
- Direkte input til AI-agenten
- Drafts-hylde med Firebase-gemte kladder
- WebApps panel med eksterne vaerktoejer

### Midterste Panel - Chat med AI
- Chatbaseret interaktion med AI-medskribent
- AI foreslaar vinkler, forbedringer og stilgreb
- Tone of voice: Martin Kongstad x Casper Christensen
- Kontekstuel hjaelp baseret paa nuvaerende artikel
- Research-integration med artikelforslag
- Preflight-tjek (moderation, TOV-kritik, factcheck)

### Hoejre Panel - Artikelpreview og Design
- Live mockup af artiklen i Apropos stil
- Dynamisk opdatering af felter
- Quick edit panel for hurtige aendringer
- Rating og tag system
- Design Editor til social media cards (Instagram/Facebook)
- Webflow CMS publish panel

## Teknisk Stack

- **Frontend:** React 19 / Next.js 15 med TypeScript
- **AI:** OpenAI (konfigureret via OPENAI_MODEL env var)
- **Styling:** Tailwind CSS
- **State Management:** React useState/useEffect
- **API:** Next.js API Routes (App Router)
- **Persistens:** Firebase Firestore (drafts, training data)
- **Upload:** Firebase Storage (billeder til Instagram)
- **CMS:** Webflow Data API v2
- **Social:** Instagram Graph API + Facebook Pages API

## Setup

1. Installer dependencies:
   ```bash
   npm install
   ```

2. Kopiér environment-variabler:
   ```bash
   cp .env.example .env.local
   ```

3. Koer env-doctor:
   ```bash
   npm run doctor
   ```

4. Start udviklingsserveren:
   ```bash
   npm run dev
   ```

5. Gaa til AI Writer:
   ```
   http://localhost:3000/ai
   ```

## Arkitektur

```
app/ai/
  AIWriterClient.tsx   - Hoved-shell: auth, state, layout
  MainChatPanel.tsx    - Chat UI: templates, noter, beskeder
  PreviewPanel.tsx     - Live artikelpreview
  SetupWizard/         - Artikelopsaetning og research
  
app/api/ai-chat/       - Hoved-completion + artikeludtraek
app/api/generate-article/ - Alternativ artikelgenerering
app/api/web-search/    - Wikipedia + DuckDuckGo research
app/api/research-engine/ - Multi-source research
app/api/quality-check/ - Kvalitetsvurdering
app/api/factcheck/     - Faktakontrol
app/api/critic/tov/    - Tone-of-voice kritik

lib/openai.ts          - Centraliseret OpenAI-klient
lib/config/env.ts      - Valideret miljoe-konfiguration
lib/apropos-ai.ts      - TOV og prompt-konstanter
```

## AI Generation Flow

1. Bruger opsaetter artikel via SetupWizard (section, forfatter, research, TOV)
2. Chat-besked sendes til `/api/ai-chat`
3. System-prompt bygges med TOV, research, noter, strukturregler
4. OpenAI completion genererer artikeludkast
5. Post-processing udtraekker titel, undertitel, intro, SEO-felter
6. Eventuel ekspansion hvis ordantal er under minimum
7. Resultat vises i PreviewPanel og kan redigeres
8. Publicering via WebflowPublishPanel eller export til social media
