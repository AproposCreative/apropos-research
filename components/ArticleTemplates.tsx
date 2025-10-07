'use client';

import { useState, useEffect } from 'react';

interface Article {
  title: string;
  source: string;
  date: string;
  content: string;
  url?: string;
}

interface ArticleTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  needsRating: boolean;
  structure: string[];
  examples: string[];
  trending?: boolean;
  articleCount?: number;
  articles?: Article[];
}

interface TrendingTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  content: string;
  tags: string[];
  trending: boolean;
  articleCount: number;
  articles?: Article[];
}

interface ArticleTemplatesProps {
  onSelectTemplate: (template: ArticleTemplate) => void;
  selectedCategory?: string;
}

// Apropos Magazine specific templates
const fallbackTemplates: ArticleTemplate[] = [
  {
    id: 'film-anmeldelse',
    name: 'Film Anmeldelse',
    description: 'Apropos film anmeldelser med fokus på oplevelse og kultur',
    content: `**Film Anmeldelse - Apropos Stil**

**Kategori:** Kultur
**Tags:** Film, Anmeldelse, Kultur

**Apropos Film Struktur:**
1. Åbningshækling - Hvad fangede dig først? Hvad gør denne film anderledes?
2. Kontekst - Hvor passer filmen ind i sin tid/genre? Hvad er dens ambition?
3. Oplevelse - Hvordan føles det at se den? Stemning, rytme, emotionel reaktion
4. Detaljer der tæller - Scener, skuespil, musik der står ud
5. Personlig refleksion - Hvad bliver siddende? Hvem ville elske/hade denne film?
6. Apropos konklusion - Ikke bare en rating, men en oplevelse der sætter sig fast

**Apropos Tone:** Personlig, reflekteret, kulturelt bevist. Som at dele en filmoplevelse med en ven der forstår både teknik og følelse.`,
    category: 'Kultur',
    tags: ['Film', 'Anmeldelse', 'Kultur'],
    needsRating: true,
    structure: ['Åbningshækling', 'Kulturel kontekst', 'Personlig oplevelse', 'Detaljer der tæller', 'Refleksion', 'Apropos konklusion'],
    examples: ['Ripley: En mesterlig blanding af kriminalitet og psykologisk spænding', 'Black Bag: Fassbender og Blanchett i perfekt parløb']
  },
  {
    id: 'musik-anmeldelse',
    name: 'Musik Anmeldelse',
    description: 'Apropos musik anmeldelser med fokus på følelse og kultur',
    content: `**Musik Anmeldelse - Apropos Stil**

**Kategori:** Kultur
**Tags:** Musik, Anmeldelse, Kultur

**Apropos Musik Struktur:**
1. Første indtryk - Hvad sker der i øret? Hvilken verden åbner sig?
2. Kontekst - Hvor kommer dette fra? Hvilken tradition/genre udfordrer det?
3. Oplevelse - Hvordan føles det at lytte? Stemning, energi, emotionel reaktion
4. Detaljer der gør forskel - Sange, tekster, produktion der rammer
5. Personlig refleksion - Hvad bliver siddende? Hvem ville elske/hade denne musik?
6. Apropos konklusion - Ikke bare en rating, men en musikoplevelse der sætter sig fast

**Apropos Tone:** Passioneret, reflekteret, kulturelt bevist. Som at dele en musikoplevelse med en ven der forstår både teknik og følelse.`,
    category: 'Kultur',
    tags: ['Musik', 'Anmeldelse', 'Kultur'],
    needsRating: true,
    structure: ['Første indtryk', 'Kulturel kontekst', 'Personlig oplevelse', 'Detaljer der gør forskel', 'Refleksion', 'Apropos konklusion'],
    examples: ['Musik der ikke larmer, men som bliver siddende']
  },
  {
    id: 'kultur-kommentar',
    name: 'Kultur Kommentar',
    description: 'Apropos kultur kommentarer med skarp analyse',
    content: `**Kultur Kommentar - Apropos Stil**

**Kategori:** Kultur
**Tags:** Kultur, Kommentar, Samfund

**Apropos Kultur Kommentar Struktur:**
1. Hækling - Hvad er det vi skal snakke om? Hvad sker der i kulturen lige nu?
2. Kontekst - Hvor kommer dette fra? Hvilke tendenser ser vi?
3. Analyse - Hvad betyder det? Hvem påvirkes? Hvad er konsekvenserne?
4. Personlig vinkel - Hvordan oplever du det? Hvilke oplevelser har du?
5. Refleksion - Hvad siger det om os? Hvor går vi hen?
6. Apropos perspektiv - Ikke bare analyse, men en kulturel refleksion der tænker videre

**Apropos Tone:** Reflekteret, analytisk, menneskelig. Som at diskutere kultur med en ven der tænker dybt og føler stærkt.`,
    category: 'Kultur',
    tags: ['Kultur', 'Kommentar', 'Samfund'],
    needsRating: false,
    structure: ['Kulturel hækling', 'Kontekst og tendenser', 'Analytisk dybde', 'Personlig vinkel', 'Refleksion', 'Apropos perspektiv'],
    examples: ['Kulturelle fænomener der rører ved noget større']
  },
  {
    id: 'interview',
    name: 'Interview',
    description: 'Apropos interviews med fokus på personen bag kunsten',
    content: `**Interview - Apropos Stil**

**Kategori:** Interview
**Tags:** Interview, Kunstner, Skaber

**Apropos Interview Struktur:**
1. Åbningshækling - Hvem er denne person? Hvad gør dem interessant?
2. Kontekst - Hvor kommer de fra? Hvilken rejse har de været på?
3. Personlige spørgsmål - Hvad driver dem? Hvilke oplevelser har formet dem?
4. Arbejdsprocess - Hvordan skaber de? Hvilke udfordringer møder de?
5. Refleksion - Hvad betyder det for dem? Hvor går de hen?
6. Apropos konklusion - Ikke bare fakta, men en person der åbner sig

**Apropos Tone:** Nysgerrig, respektfuld, menneskelig. Som at have en dyb samtale med en interessant person.`,
    category: 'Interview',
    tags: ['Interview', 'Kunstner', 'Skaber'],
    needsRating: false,
    structure: ['Personlig hækling', 'Kontekst og baggrund', 'Personlige spørgsmål', 'Arbejdsprocess', 'Refleksion', 'Apropos konklusion'],
    examples: ['Interviews med kunstnere og skabere']
  },
  {
    id: 'lifestyle-refleksion',
    name: 'Lifestyle Refleksion',
    description: 'Apropos lifestyle artikler med personlig dybde',
    content: `**Lifestyle Refleksion - Apropos Stil**

**Kategori:** Lifestyle
**Tags:** Lifestyle, Refleksion, Oplevelse

**Apropos Lifestyle Struktur:**
1. Oplevelseshækling - Hvad oplevede du? Hvad fangede dig?
2. Kontekst - Hvor skete det? Hvilken verden var du i?
3. Personlig oplevelse - Hvordan føltes det? Hvilke detaljer husker du?
4. Refleksion - Hvad lærte du? Hvordan påvirkede det dig?
5. Perspektiv - Hvad betyder det for andre? Hvem ville elske dette?
6. Apropos konklusion - Ikke bare en oplevelse, men en refleksion der sætter sig fast

**Apropos Tone:** Personlig, reflekteret, inspirerende. Som at dele en oplevelse med en ven der forstår både det smukke og det meningsfulde.`,
    category: 'Lifestyle',
    tags: ['Lifestyle', 'Refleksion', 'Oplevelse'],
    needsRating: false,
    structure: ['Oplevelseshækling', 'Kontekst og miljø', 'Personlig oplevelse', 'Refleksion og læring', 'Perspektiv', 'Apropos konklusion'],
    examples: ['Rejseoplevelser og livsrefleksioner']
  },
  {
    id: 'tech-kultur',
    name: 'Tech & Kultur',
    description: 'Apropos tech artikler med kulturelt perspektiv',
    content: `**Tech & Kultur - Apropos Stil**

**Kategori:** Tech
**Tags:** Tech, Kultur, Samfund

**Apropos Tech Struktur:**
1. Teknologihækling - Hvad er det nye? Hvad gør det anderledes?
2. Kulturel kontekst - Hvor passer det ind? Hvilke tendenser ser vi?
3. Personlig oplevelse - Hvordan oplever du det? Hvilke følelser vækker det?
4. Samfundsmæssig refleksion - Hvad betyder det for os? Hvem påvirkes?
5. Fremtidsvision - Hvor går vi hen? Hvilke muligheder åbner sig?
6. Apropos konklusion - Ikke bare tech, men en kulturel refleksion over fremtiden

**Apropos Tone:** Reflekteret, kulturelt bevist, menneskelig. Som at diskutere tech med en ven der forstår både teknologi og kultur.`,
    category: 'Tech',
    tags: ['Tech', 'Kultur', 'Samfund'],
    needsRating: false,
    structure: ['Teknologihækling', 'Kulturel kontekst', 'Personlig oplevelse', 'Samfundsrefleksion', 'Fremtidsvision', 'Apropos konklusion'],
    examples: ['Tech der påvirker kultur og samfund']
  }
];

export default function ArticleTemplates({ onSelectTemplate, selectedCategory }: ArticleTemplatesProps) {
  const [templates, setTemplates] = useState<ArticleTemplate[]>(fallbackTemplates);
  const [trendingTemplates, setTrendingTemplates] = useState<TrendingTemplate[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);

  useEffect(() => {
    // Use our new Apropos-specific templates directly
    setTemplates(fallbackTemplates);
  }, []);

  useEffect(() => {
    const fetchTrendingTemplates = async () => {
      try {
        const response = await fetch('/api/trending');
        if (response.ok) {
          const data = await response.json();
          if (data.trendingTemplates && data.trendingTemplates.length > 0) {
            setTrendingTemplates(data.trendingTemplates);
          }
        }
      } catch (error) {
        console.error('Error fetching trending templates:', error);
      } finally {
        setIsLoadingTrending(false);
      }
    };

    fetchTrendingTemplates();
  }, []);

  const convertTrendingToTemplate = (trending: TrendingTemplate): ArticleTemplate => ({
    id: trending.id,
    name: trending.name,
    description: trending.description,
    content: trending.content,
    category: trending.category,
    tags: trending.tags,
    needsRating: trending.category.toLowerCase().includes('anmeldelse') || 
                trending.category.toLowerCase().includes('review'),
    structure: [],
    examples: [],
    trending: true,
    articleCount: trending.articleCount,
    articles: trending.articles
  });

  const handleTrendingTemplateClick = (template: TrendingTemplate) => {
    // Always pass the template to parent - let MainChatPanel handle article picker
    onSelectTemplate(convertTrendingToTemplate(template));
  };

  // Filter templates based on selected category
  const getFilteredTemplates = () => {
    if (!selectedCategory) return templates;
    
    return templates.filter(template => {
      const categoryMatch = template.category.toLowerCase().includes(selectedCategory.toLowerCase()) ||
                           template.category.toLowerCase().includes('kultur') && selectedCategory.toLowerCase().includes('kultur') ||
                           template.category.toLowerCase().includes('tech') && selectedCategory.toLowerCase().includes('tech');
      return categoryMatch;
    });
  };

  const getFilteredTrendingTemplates = () => {
    if (!selectedCategory) return trendingTemplates;
    
    return trendingTemplates.filter(template => {
      const categoryMatch = template.category.toLowerCase().includes(selectedCategory.toLowerCase()) ||
                           template.category.toLowerCase().includes('tech') && selectedCategory.toLowerCase().includes('tech');
      return categoryMatch;
    });
  };

  if (isLoadingTrending) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="px-3 py-1.5 text-white/50 text-xs font-medium rounded-lg border border-orange-500/50 bg-orange-900/20 animate-pulse">
            🔥 Loading trending...
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="px-3 py-1.5 text-white/50 text-xs font-medium rounded-lg border border-white/20 bg-black animate-pulse">
            Loading templates...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trending Templates */}
      {getFilteredTrendingTemplates().length > 0 && (
        <div>
          <h4 className="text-white text-sm font-medium mb-2 flex items-center gap-2">
            🔥 Trending Nu
            <span className="text-xs text-white/60">
              (baseret på {getFilteredTrendingTemplates()[0]?.articleCount || 0} artikler)
            </span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {getFilteredTrendingTemplates().map((template) => (
              <button
                key={template.id}
                onClick={() => onSelectTemplate(convertTrendingToTemplate(template))}
                className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-orange-500/50"
                style={{ backgroundColor: 'rgb(30, 20, 0)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(40, 30, 0)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(30, 20, 0)'}
                title={`${template.description} - Baseret på ${template.articleCount} artikler`}
              >
                🔥 {template.name}
                <span className="ml-1 text-orange-400 text-xs">({template.articleCount})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Regular Templates */}
      <div>
        <h4 className="text-white text-sm font-medium mb-2">📝 Apropos Templates</h4>
        <div className="flex flex-wrap gap-2">
          {getFilteredTemplates().map((template) => (
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
              {template.needsRating && (
                <span className="ml-1 text-yellow-400">⭐</span>
              )}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
