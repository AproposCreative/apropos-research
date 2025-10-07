// Apropos Magazine AI Integration
// TOV: Martin Kongstad x Casper Christensen

interface AproposTOV {
  personality: string;
  tone: string;
  style: string;
  examples: string[];
}

export const APROPOS_TOV: AproposTOV = {
  personality: "Personlig, ærlig, humoristisk, skarp uden at være ondskabsfuld",
  tone: "Casual, intelligent, nysgerrig, reflekterende",
  style: "Korte, præcise sætninger blandet med længere, poetiske passager",
  examples: [
    "Vi er ikke bange for at sige hvad vi mener, men vi gør det med respekt",
    "Humor og ironi er vores værktøjer, ikke våben",
    "Vi stiller spørgsmålstegn ved det åbenlyse og fejrer det uventede",
    "Personlige anekdoter og refleksioner er vigtige i vores storytelling"
  ]
};

export const APROPOS_PROMPTS = {
  articleGeneration: `Du er Apropos Magazine's AI-assistent. Din opgave er at hjælpe med at skrive artikler i vores unikke tone of voice.

**Vores TOV (Martin Kongstad x Casper Christensen):**
- Personlig, ærlig, humoristisk uden at være ondskabsfuld
- Intelligent, nysgerrig og reflekterende
- Blander korte, præcise sætninger med længere, poetiske passager
- Stiller spørgsmålstegn ved det åbenlyse og fejrer det uventede
- Bruger personlige anekdoter og refleksioner

**Artikel struktur:**
Baseret på den valgte template, generer en komplet artikel med:

1. **Titel** - Fængende, præcis, TOV-agtig
2. **Subtitle** - Uddybende, nysgerrig
3. **Intro** - Hækling der fanger læseren, personlig vinkel
4. **Hovedindhold** - Struktureret efter template, med TOV gennemgående
5. **Konklusion** - Refleksiv, eftertænksom, call-to-action

**Vigtige regler:**
- Brug "jeg" og "vi" - vi er personlige
- Vær ærlig om både positive og negative aspekter
- Inkorporer humor og ironi naturligt
- Brug konkrete eksempler og anekdoter
- Stil spørgsmål til læseren og samfundet
- Vær kulturelt bevist og relevant

Generer nu artiklen baseret på den givne template og kontekst.`,

  webflowFields: `Baseret på den genererede artikel, udfyld følgende Webflow CMS felter:

**Artikel metadata:**
- Title (artikel titel)
- Slug (URL-venlig version af titlen)
- Excerpt (kort beskrivelse til social media)
- Category (Gaming/Kultur/Tech/Lifestyle/Opinion)
- Tags (array af relevante tags)
- Author (Frederik Kragh)
- Published Date (nuværende dato)
- Featured Image (forslag til billede)

**Indhold:**
- Content (artikel HTML med korrekt formatering)
- Meta Description (SEO beskrivelse)
- Social Media Title (til Facebook/Twitter)
- Social Media Description (til deling)

**Tekniske felter:**
- SEO Title
- SEO Description
- Reading Time (estimerede minutter)
- Word Count

Generer alle felter i JSON format klar til Webflow CMS.`
};

export interface WebflowArticle {
  // Core fields
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  author: string;
  publishedDate: string;
  
  // Content
  content: string;
  metaDescription: string;
  socialTitle: string;
  socialDescription: string;
  
  // SEO
  seoTitle: string;
  seoDescription: string;
  readingTime: number;
  wordCount: number;
  
  // Media
  featuredImage?: string;
  
  // Status
  status: 'draft' | 'published' | 'scheduled';
}

export const generateArticleWithTOV = async (
  template: string,
  context: string,
  category: string,
  tags: string[]
): Promise<string> => {
  const prompt = `${APROPOS_PROMPTS.articleGeneration}

**Template:** ${template}
**Kontekst:** ${context}
**Kategori:** ${category}
**Tags:** ${tags.join(', ')}

Generer nu artiklen i vores TOV.`;

  try {
    const response = await fetch('/api/generate-article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    
    const data = await response.json();
    return data.article;
  } catch (error) {
    console.error('Error generating article:', error);
    throw error;
  }
};

export const generateWebflowFields = async (
  article: string,
  template: string
): Promise<WebflowArticle> => {
  const prompt = `${APROPOS_PROMPTS.webflowFields}

**Artikel:**
${article}

**Template:** ${template}

Generer Webflow CMS felter i JSON format.`;

  try {
    const response = await fetch('/api/generate-webflow-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    
    const data = await response.json();
    return data.webflowFields;
  } catch (error) {
    console.error('Error generating Webflow fields:', error);
    throw error;
  }
};
