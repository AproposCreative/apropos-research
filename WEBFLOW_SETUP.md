# Webflow CMS Integration Setup

## 🔧 **Environment Variables Required**

Tilføj disse environment variables til din `.env.local` fil:

```bash
# Webflow API Configuration
WEBFLOW_API_TOKEN=your_webflow_api_token_here
WEBFLOW_SITE_ID=your_webflow_site_id_here

# Optional: Base URL for API calls
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## 📋 **Webflow CMS Collections Setup**

### **1. Authors Collection**
Opret en "Authors" collection i Webflow med følgende felter:

- **name** (Plain Text) - Forfatterens navn
- **slug** (Plain Text) - URL slug
- **bio** (Rich Text) - Biografi
- **avatar** (Image) - Profilbillede
- **email** (Email) - Email adresse
- **twitter** (Plain Text) - Twitter handle
- **instagram** (Plain Text) - Instagram handle
- **linkedin** (Plain Text) - LinkedIn profil
- **tov** (Plain Text) - Tone of Voice beskrivelse
- **specialties** (Plain Text List) - Skriveområder

### **2. Articles Collection**
Opret en "Articles" collection med følgende felter:

- **name** (Plain Text) - Artikel titel
- **slug** (Plain Text) - URL slug
- **subtitle** (Plain Text) - Undertitel
- **post-body** (Rich Text) - Artikel indhold
- **excerpt** (Plain Text) - Kort beskrivelse
- **category** (Plain Text) - Kategori
- **tags** (Plain Text List) - Tags
- **author** (Reference to Authors) - Forfatter reference
- **rating** (Number) - Rating (1-5)
- **featured-image** (Image) - Hovedbillede
- **publish-date** (Date) - Udgivelsesdato
- **status** (Plain Text) - Status (draft/published/archived)
- **seo-title** (Plain Text) - SEO titel
- **seo-description** (Plain Text) - SEO beskrivelse
- **read-time** (Number) - Læsetid i minutter
- **word-count** (Number) - Antal ord
- **featured** (Boolean) - Featured artikel
- **trending** (Boolean) - Trending artikel

## 🔑 **Hvordan får du API Token**

1. Gå til [Webflow Account Settings](https://webflow.com/dashboard/account/general)
2. Scroll ned til "API Access"
3. Klik "Generate API Key"
4. Kopier token og tilføj til `.env.local`

## 🆔 **Hvordan finder du Site ID**

1. Gå til din Webflow site dashboard
2. Klik på "Settings" i sidebar
3. Gå til "General" tab
3. Site ID vises øverst under "Site Details"

## 🚀 **Features Implementeret**

### ✅ **Webflow Integration**
- **Real Authors:** Henter forfattere fra Webflow CMS
- **TOV Integration:** Bruger rigtig tone of voice fra forfattere
- **Article Fields:** Alle nødvendige felter for artikel udgivelse
- **Publish Workflow:** Komplet workflow til at udgive artikler

### ✅ **AI Writer Features**
- **Template Selection:** Vælg artikel template
- **Author Selection:** Vælg forfatter med rigtig TOV
- **Rating Selection:** Vælg rating for anmeldelser
- **Chat Interface:** AI chat med forfatter-specifik tone
- **Article Preview:** Live preview af artikel under udvikling
- **Publish Panel:** Komplet panel til at udgive til Webflow

### ✅ **Quality Assurance**
- **Plagiarism Check:** (Kommer snart)
- **Error Detection:** (Kommer snart)
- **Relevance Analysis:** (Kommer snart)
- **Field Validation:** Validerer alle påkrævede felter

## 📝 **Workflow**

1. **Template:** Vælg artikel template (anmeldelse, interview, etc.)
2. **Author:** Vælg forfatter med rigtig TOV fra Webflow
3. **Rating:** Vælg rating hvis anmeldelse
4. **Chat:** Chat med AI om artiklen i forfatterens tone
5. **Preview:** Se live preview af artikel
6. **Publish:** Udgiv direkte til Webflow CMS

## 🔧 **Fallback System**

Hvis Webflow ikke er tilgængelig:
- Bruger fallback forfattere (Frederik Kragh, Martin Kongstad, Casper Christensen)
- Gemmer artikler lokalt
- Kan stadig bruge AI chat funktionalitet

## 🎯 **Næste Skridt**

1. **Konfigurer Webflow:** Sæt op collections og felter
2. **API Token:** Få Webflow API token
3. **Test Integration:** Test forfatter hentning
4. **Publish Test:** Test artikel udgivelse
5. **Quality Features:** Implementer plagiat check og fejl detection

---

**AI Writer er nu klar til at producere professionelle artikler til Apropos Magazine med rigtig forfatter TOV og direkte Webflow integration! 🚀**
