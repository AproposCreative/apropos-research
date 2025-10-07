# AI Integration Setup for Apropos Magazine

## OpenAI API Integration

### 1. OpenAI API Key
```bash
# I .env.local filen:
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 2. Test AI Integration
Gå til `/ai` siden og test AI chat funktionaliteten.

## Webflow CMS Integration

### 1. Webflow API Setup

1. **Log ind på Webflow Dashboard**
2. **Gå til Account Settings > Integrations**
3. **Generer en API Token**
4. **Find din Site ID og Collection ID**

### 2. Environment Variables
```bash
# I .env.local filen:
WEBFLOW_API_KEY=your-webflow-api-key
WEBFLOW_SITE_ID=your-site-id
WEBFLOW_COLLECTION_ID=your-collection-id
```

### 3. Webflow Collection Setup

Din Webflow collection skal have følgende felter:

**Core Fields:**
- `article-title` (Plain Text)
- `article-slug` (Plain Text)
- `article-excerpt` (Plain Text)
- `article-category` (Plain Text)
- `article-tags` (Text Array)
- `article-author` (Plain Text)
- `article-published-date` (Date & Time)
- `article-content` (Rich Text)
- `article-meta-description` (Plain Text)
- `article-social-title` (Plain Text)
- `article-social-description` (Plain Text)
- `article-seo-title` (Plain Text)
- `article-seo-description` (Plain Text)
- `article-reading-time` (Number)
- `article-word-count` (Number)
- `article-featured-image` (Image)
- `article-status` (Plain Text)
- `is-draft` (Switch)

### 4. Test Webflow Integration

1. **Gå til `/ai` siden**
2. **Klik på AI magic ikonet** (stjerne-agtig ikon)
3. **Generer en artikel** med TOV
4. **Generer Webflow felter**
5. **Publicer til Webflow CMS**

## Apropos TOV (Tone of Voice)

AI'en er trænet til at skrive i Apropos' karakteristiske stil:

**Personlighed:**
- Personlig, ærlig, humoristisk uden at være ondskabsfuld
- Intelligent, nysgerrig og reflekterende
- Blander korte, præcise sætninger med længere, poetiske passager

**Stil:**
- Bruger "jeg" og "vi" - vi er personlige
- Ærlig om både positive og negative aspekter
- Inkorporer humor og ironi naturligt
- Bruger konkrete eksempler og anekdoter
- Stil spørgsmål til læseren og samfundet
- Kulturelt bevidst og relevant

**Inspiration:**
- Martin Kongstad
- Casper Christensen
- Personlige anekdoter og refleksioner
- Fokus på oplevelse frem for teknik

## Features

### 1. AI Chat
- Realtids chat med Apropos AI
- TOV-optimeret svar
- Kontekstuel forståelse af artikel data

### 2. Article Templates
- 10 professionelle templates
- Gaming, Kultur, Tech, Lifestyle, etc.
- Auto-population af artikel data

### 3. Article Generation
- Generer komplette artikler med TOV
- Auto-fyldning af alle felter
- Struktureret output

### 4. Webflow Integration
- Auto-generering af alle CMS felter
- Direkte publicering til Webflow
- SEO og social media optimering

### 5. Draft Management
- Auto-save til Firebase
- Google Sign-In
- Cloud-baseret persistence

## Troubleshooting

### OpenAI API Issues
```bash
# Test API key:
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     -H "Content-Type: application/json" \
     https://api.openai.com/v1/models
```

### Webflow API Issues
```bash
# Test API key:
curl -H "Authorization: Bearer $WEBFLOW_API_KEY" \
     -H "accept-version: 1.0.0" \
     https://api.webflow.com/v2/sites/$WEBFLOW_SITE_ID
```

### Firebase Issues
Se `SIMPLE_FIREBASE_FIX.md` for Firebase setup.

## Next Steps

1. **Konfigurer OpenAI API key**
2. **Setup Webflow CMS collection**
3. **Test artikel generering**
4. **Test Webflow publicering**
5. **Fine-tune TOV prompts**

AI Writer platformen er nu klar til at generere og publicere artikler i Apropos' unikke stil! 🚀
