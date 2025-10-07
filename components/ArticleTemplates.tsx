'use client';

interface ArticleTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
}

interface ArticleTemplatesProps {
  onSelectTemplate: (template: ArticleTemplate) => void;
}

const templates: ArticleTemplate[] = [
  {
    id: 'gaming-review',
    name: 'Gaming Anmeldelse',
    description: 'Struktur til gaming anmeldelser i Apropos stil',
    content: `**Gaming Anmeldelse Template**

**Kategori:** Gaming
**Tags:** Gaming, Anmeldelse, PlayStation/PC/Xbox

**Struktur:**
1. Intro - Hvad er spillet? Hvem har lavet det?
2. Gameplay - Hvordan spiller det? Kontroller, mekanikker
3. Grafik & Lyd - Visuelt og audio oplevelse
4. Historie - Er fortællingen god? Karakterer?
5. Verdi - Er det pengene værd? Hvor mange timer?
6. Konklusion - Samlet vurdering og anbefaling

**Tone:** Personlig, ærlig, humoristisk - Martin Kongstad x Casper Christensen stil`,
    category: 'Gaming',
    tags: ['Gaming', 'Anmeldelse']
  },
  {
    id: 'culture-review',
    name: 'Kultur Anmeldelse',
    description: 'Template til film, musik og kultur anmeldelser',
    content: `**Kultur Anmeldelse Template**

**Kategori:** Kultur
**Tags:** Kultur, Anmeldelse, Film/Musik/Teater

**Struktur:**
1. Kontekst - Hvad er det? Hvem er kunstneren?
2. Oplevelse - Hvordan føles det? Stemning og atmosfære
3. Teknisk - Produktion, kvalitet, præstationer
4. Kulturel betydning - Hvor passer det ind? Referencer
5. Personlig reflektion - Hvad betyder det for dig?
6. Anbefaling - Hvem skal se/høre det?

**Tone:** Reflekterende, personlig, kulturelt bevist`,
    category: 'Kultur',
    tags: ['Kultur', 'Anmeldelse']
  },
  {
    id: 'opinion-piece',
    name: 'Kronik',
    description: 'Struktur til meningsdannende artikler',
    content: `**Kronik Template**

**Kategori:** Opinion
**Tags:** Opinion, Samfund, Debatter

**Struktur:**
1. Hækling - Stærk åbning der fanger læseren
2. Problemstilling - Hvad er det centrale problem?
3. Kontekst - Baggrund og relevante fakta
4. Argumenter - Støttepunkter til dit synspunkt
5. Modargumenter - Hvad siger modstanderne?
6. Løsning - Hvad foreslår du?
7. Call to action - Hvad skal læseren gøre?

**Tone:** Engageret, velargumenteret, provokerende`,
    category: 'Opinion',
    tags: ['Opinion', 'Samfund']
  },
  {
    id: 'interview',
    name: 'Interview',
    description: 'Struktur til interviews med kunstnere og skabere',
    content: `**Interview Template**

**Kategori:** Interview
**Tags:** Interview, Kunstner, Skaber

**Struktur:**
1. Introduktion - Hvem er personen? Hvorfor er de relevante?
2. Baggrund - Vej til succes, tidlige år
3. Nuværende projekt - Hvad arbejder de på nu?
4. Proces - Hvordan skaber de? Arbejdsmetoder
5. Inspiration - Hvem/hvad påvirker dem?
6. Fremtiden - Hvad kommer næste?
7. Personlige spørgsmål - Hvem er de som person?

**Tone:** Nysgerrig, respektfuld, åben`,
    category: 'Interview',
    tags: ['Interview', 'Kunstner']
  },
  {
    id: 'news-analysis',
    name: 'Nyhedsanalyse',
    description: 'Dybtgående analyse af aktuelle begivenheder',
    content: `**Nyhedsanalyse Template**

**Kategori:** Nyheder
**Tags:** Nyheder, Analyse, Samfund

**Struktur:**
1. Hvad skete der? - Fakta og begivenheder
2. Hvorfor skete det? - Årsager og baggrund
3. Hvem påvirkes? - Konsekvenser for forskellige grupper
4. Historisk kontekst - Hvor passer det ind?
5. Fremtidsudsigter - Hvad betyder det for fremtiden?
6. Læserens rolle - Hvad skal man være opmærksom på?

**Tone:** Balanceret, analytisk, informativ`,
    category: 'Nyheder',
    tags: ['Nyheder', 'Analyse']
  },
  {
    id: 'tech-review',
    name: 'Tech Anmeldelse',
    description: 'Anmeldelse af gadgets, apps og teknologi',
    content: `**Tech Anmeldelse Template**

**Kategori:** Tech
**Tags:** Tech, Gadgets, Apps, Innovation

**Struktur:**
1. Hvad er det? - Produktbeskrivelse og formål
2. Design & Build - Hvordan ser og føles det?
3. Funktionalitet - Hvordan fungerer det i praksis?
4. Brugervenlighed - Er det let at bruge?
5. Pris vs Værdi - Er det pengene værd?
6. Konkurrenter - Hvordan sammenligner det sig?
7. Anbefaling - Hvem skal købe det?

**Tone:** Teknisk, men tilgængelig, ærlig`,
    category: 'Tech',
    tags: ['Tech', 'Anmeldelse']
  },
  {
    id: 'lifestyle-feature',
    name: 'Lifestyle Feature',
    description: 'Længere feature om livsstil, rejser og oplevelser',
    content: `**Lifestyle Feature Template**

**Kategori:** Lifestyle
**Tags:** Lifestyle, Rejser, Oplevelser, Inspiration

**Struktur:**
1. Scene-setting - Hvor er vi? Hvad oplever vi?
2. Personlige oplevelser - Hvad skete der?
3. Lokale perspektiver - Hvad siger lokalbefolkningen?
4. Kulturel kontekst - Hvordan passer det ind?
5. Praktiske tips - Hvad skal læseren vide?
6. Refleksioner - Hvad lærte vi?
7. Inspiration - Hvorfor skal andre opleve det?

**Tone:** Personlig, inspirerende, rejsende`,
    category: 'Lifestyle',
    tags: ['Lifestyle', 'Feature']
  },
  {
    id: 'profile-piece',
    name: 'Profil',
    description: 'Dybtgående portræt af en person',
    content: `**Profil Template**

**Kategori:** Profil
**Tags:** Profil, Person, Karriere, Inspiration

**Struktur:**
1. Introduktion - Hvem er personen? Hvorfor er de interessante?
2. Tidlige år - Baggrund og vej til succes
3. Nuværende arbejde - Hvad laver de nu?
4. Arbejdsmetoder - Hvordan nærmer de sig deres felt?
5. Udfordringer - Hvad har de kæmpet med?
6. Fremtidsplaner - Hvad kommer næste?
7. Personlige detaljer - Hvem er de uden for arbejdet?

**Tone:** Respektfuld, nysgerrig, menneskelig`,
    category: 'Profil',
    tags: ['Profil', 'Person']
  },
  {
    id: 'social-commentary',
    name: 'Samfundskommentar',
    description: 'Refleksion over sociale tendenser og fænomener',
    content: `**Samfundskommentar Template**

**Kategori:** Samfund
**Tags:** Samfund, Tendenser, Kommentar, Analyse

**Struktur:**
1. Fænomenet - Hvad observerer vi?
2. Udbredelse - Hvor udbredt er det?
3. Årsager - Hvorfor sker det nu?
4. Konsekvenser - Hvad betyder det for samfundet?
5. Historiske paralleller - Har vi set det før?
6. Fremtid - Hvor går det hen?
7. Handling - Hvad kan vi gøre?

**Tone:** Reflekterende, analytisk, samfundsbevidst`,
    category: 'Samfund',
    tags: ['Samfund', 'Kommentar']
  },
  {
    id: 'creative-writing',
    name: 'Kreativ Skrivning',
    description: 'Fri kreativ skrivning og essays',
    content: `**Kreativ Skrivning Template**

**Kategori:** Kreativ
**Tags:** Kreativ, Essay, Fri Skrivning, Kunst

**Struktur:**
1. Åbning - Stærk, fængende start
2. Udvikling - Udbygning af tema/ide
3. Perspektivskift - Uventede vinkler
4. Emotionel dybde - Personlige refleksioner
5. Sproglig eksperiment - Kreative sproglige løsninger
6. Afslutning - Stærk, eftertænksom slutning

**Tone:** Kreativ, personlig, eksperimenterende`,
    category: 'Kreativ',
    tags: ['Kreativ', 'Essay']
  }
];

export default function ArticleTemplates({ onSelectTemplate }: ArticleTemplatesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {templates.map((template) => (
        <button
          key={template.id}
          onClick={() => onSelectTemplate(template)}
          className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20"
          style={{ backgroundColor: 'rgb(0, 0, 0)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
          title={template.description}
        >
          {template.name}
        </button>
      ))}
    </div>
  );
}
