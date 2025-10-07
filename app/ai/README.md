# AI Writer for Apropos Magazine

En AI-drevet skriveoplevelse til Apropos Magazine's redaktionelle platform.

## Funktioner

### 🖋️ **Venstre Panel - Noter og Prompts**
- Skriv kontekst, noter og artikel-idéer
- Quick action knapper:
  - Auto Generate Article
  - New Gaming Article  
  - New Culture Article
- Direkte input til AI-agenten

### 💬 **Midterste Panel - Chat med AI**
- Chatbaseret interaktion med AI-medskribent
- AI foreslår vinkler, forbedringer og stilgreb
- Tone of voice: Martin Kongstad x Casper Christensen
- Kontekstuel hjælp baseret på nuværende artikel

### 👁️ **Højre Panel - Artikelpreview**
- Live mockup af artiklen i Apropos stil
- Dynamisk opdatering af felter
- Quick edit panel for hurtige ændringer
- Rating og tag system

## Setup

1. **Installer dependencies:**
   ```bash
   npm install openai
   ```

2. **Sæt miljøvariabel:**
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Start udviklingsserveren:**
   ```bash
   npm run dev
   ```

4. **Gå til AI Writer:**
   ```
   http://localhost:3000/ai
   ```

## Teknisk Stack

- **Frontend:** React/Next.js med TypeScript
- **AI:** OpenAI GPT-4o
- **Styling:** Tailwind CSS
- **State Management:** React useState/useEffect
- **API:** Next.js API Routes

## AI System Prompt

AI'en er trænet til at hjælpe med:
- Udvikling af artikelidéer og vinkler
- Forbedring af tekster og retorik
- Foreslå stilgreb og strukturer
- Give konstruktiv feedback
- Være kreativ sparringspartner

Tone: Personlig, skarp, ærlig og humoristisk - uden at være teknisk eller tør.

## Roadmap

- [ ] Firebase backend integration
- [ ] Webflow integration
- [ ] Artikel export funktionalitet
- [ ] Collaboration features
- [ ] Template system
- [ ] Advanced AI features
