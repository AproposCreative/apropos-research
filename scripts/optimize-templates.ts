#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

interface AproposArticle {
  url: string;
  title: string;
  author: string;
  category: string;
  content: string;
  date: string;
  tags: string[];
  excerpt: string;
}

interface AuthorProfile {
  name: string;
  articles: AproposArticle[];
  writingStyle: string;
  commonThemes: string[];
  averageLength: number;
  toneOfVoice: string;
}

interface OptimizedTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  needsRating: boolean;
  structure: string[];
  examples: string[];
}

class TemplateOptimizer {
  private articles: AproposArticle[] = [];
  private authors: AuthorProfile[] = [];

  async loadScrapedData(): Promise<void> {
    const dataDir = path.join(process.cwd(), 'data');
    
    try {
      const articlesData = fs.readFileSync(path.join(dataDir, 'apropos-articles.json'), 'utf8');
      this.articles = JSON.parse(articlesData);
      console.log(`📚 Loaded ${this.articles.length} articles`);
      
      const authorsData = fs.readFileSync(path.join(dataDir, 'apropos-authors.json'), 'utf8');
      this.authors = JSON.parse(authorsData);
      console.log(`👥 Loaded ${this.authors.length} author profiles`);
    } catch (error) {
      console.error('❌ Could not load scraped data. Run scrape:apropos first.');
      process.exit(1);
    }
  }

  optimizeTemplates(): OptimizedTemplate[] {
    console.log('🔧 Optimizing templates based on scraped articles...');
    
    const templates: OptimizedTemplate[] = [
      this.optimizeGamingTemplate(),
      this.optimizeCultureTemplate(),
      this.optimizeOpinionTemplate(),
      this.optimizeInterviewTemplate(),
      this.optimizeNewsTemplate(),
      this.optimizeTechTemplate(),
      this.optimizeLifestyleTemplate(),
      this.optimizeProfileTemplate(),
      this.optimizeSocialTemplate(),
      this.optimizeCreativeTemplate()
    ];

    return templates.filter(t => t !== null) as OptimizedTemplate[];
  }

  private optimizeGamingTemplate(): OptimizedTemplate {
    const gamingArticles = this.articles.filter(a => 
      a.category.toLowerCase().includes('gaming') || 
      a.tags.some(tag => tag.toLowerCase().includes('gaming')) ||
      a.content.toLowerCase().includes('spil') ||
      a.content.toLowerCase().includes('playstation') ||
      a.content.toLowerCase().includes('xbox') ||
      a.content.toLowerCase().includes('pc')
    );

    const structure = this.analyzeArticleStructure(gamingArticles);
    const examples = this.getBestExamples(gamingArticles, 'gaming');

    return {
      id: 'gaming-review',
      name: 'Gaming Anmeldelse',
      description: 'Struktur til gaming anmeldelser baseret på Apropos stil',
      content: this.buildTemplateContent('Gaming', structure, examples, true),
      category: 'Gaming',
      tags: ['Gaming', 'Anmeldelse', 'Spil'],
      needsRating: true,
      structure,
      examples
    };
  }

  private optimizeCultureTemplate(): OptimizedTemplate {
    const cultureArticles = this.articles.filter(a => 
      a.category.toLowerCase().includes('kultur') || 
      a.tags.some(tag => 
        tag.toLowerCase().includes('film') ||
        tag.toLowerCase().includes('musik') ||
        tag.toLowerCase().includes('teater') ||
        tag.toLowerCase().includes('kultur')
      )
    );

    const structure = this.analyzeArticleStructure(cultureArticles);
    const examples = this.getBestExamples(cultureArticles, 'kultur');

    return {
      id: 'culture-review',
      name: 'Kultur Anmeldelse',
      description: 'Template til film, musik og kultur anmeldelser',
      content: this.buildTemplateContent('Kultur', structure, examples, true),
      category: 'Kultur',
      tags: ['Kultur', 'Anmeldelse', 'Film', 'Musik'],
      needsRating: true,
      structure,
      examples
    };
  }

  private optimizeOpinionTemplate(): OptimizedTemplate {
    const opinionArticles = this.articles.filter(a => 
      a.category.toLowerCase().includes('opinion') || 
      a.category.toLowerCase().includes('kronik') ||
      a.tags.some(tag => 
        tag.toLowerCase().includes('opinion') ||
        tag.toLowerCase().includes('kronik') ||
        tag.toLowerCase().includes('debatter')
      )
    );

    const structure = this.analyzeArticleStructure(opinionArticles);
    const examples = this.getBestExamples(opinionArticles, 'opinion');

    return {
      id: 'opinion-piece',
      name: 'Kronik',
      description: 'Struktur til meningsdannende artikler',
      content: this.buildTemplateContent('Opinion', structure, examples, false),
      category: 'Opinion',
      tags: ['Opinion', 'Samfund', 'Debatter'],
      needsRating: false,
      structure,
      examples
    };
  }

  private optimizeInterviewTemplate(): OptimizedTemplate {
    const interviewArticles = this.articles.filter(a => 
      a.title.toLowerCase().includes('interview') ||
      a.content.toLowerCase().includes('interview') ||
      a.tags.some(tag => tag.toLowerCase().includes('interview'))
    );

    const structure = this.analyzeArticleStructure(interviewArticles);
    const examples = this.getBestExamples(interviewArticles, 'interview');

    return {
      id: 'interview',
      name: 'Interview',
      description: 'Struktur til interviews med kunstnere og skabere',
      content: this.buildTemplateContent('Interview', structure, examples, false),
      category: 'Interview',
      tags: ['Interview', 'Kunstner', 'Skaber'],
      needsRating: false,
      structure,
      examples
    };
  }

  private optimizeNewsTemplate(): OptimizedTemplate {
    const newsArticles = this.articles.filter(a => 
      a.category.toLowerCase().includes('nyheder') ||
      a.tags.some(tag => tag.toLowerCase().includes('nyheder'))
    );

    const structure = this.analyzeArticleStructure(newsArticles);
    const examples = this.getBestExamples(newsArticles, 'nyheder');

    return {
      id: 'news-analysis',
      name: 'Nyhedsanalyse',
      description: 'Dybtgående analyse af aktuelle begivenheder',
      content: this.buildTemplateContent('Nyheder', structure, examples, false),
      category: 'Nyheder',
      tags: ['Nyheder', 'Analyse', 'Samfund'],
      needsRating: false,
      structure,
      examples
    };
  }

  private optimizeTechTemplate(): OptimizedTemplate {
    const techArticles = this.articles.filter(a => 
      a.category.toLowerCase().includes('tech') ||
      a.tags.some(tag => 
        tag.toLowerCase().includes('tech') ||
        tag.toLowerCase().includes('gadget') ||
        tag.toLowerCase().includes('app')
      )
    );

    const structure = this.analyzeArticleStructure(techArticles);
    const examples = this.getBestExamples(techArticles, 'tech');

    return {
      id: 'tech-review',
      name: 'Tech Anmeldelse',
      description: 'Anmeldelse af gadgets, apps og teknologi',
      content: this.buildTemplateContent('Tech', structure, examples, true),
      category: 'Tech',
      tags: ['Tech', 'Gadgets', 'Apps', 'Innovation'],
      needsRating: true,
      structure,
      examples
    };
  }

  private optimizeLifestyleTemplate(): OptimizedTemplate {
    const lifestyleArticles = this.articles.filter(a => 
      a.category.toLowerCase().includes('lifestyle') ||
      a.tags.some(tag => 
        tag.toLowerCase().includes('rejser') ||
        tag.toLowerCase().includes('oplevelser') ||
        tag.toLowerCase().includes('lifestyle')
      )
    );

    const structure = this.analyzeArticleStructure(lifestyleArticles);
    const examples = this.getBestExamples(lifestyleArticles, 'lifestyle');

    return {
      id: 'lifestyle-feature',
      name: 'Lifestyle Feature',
      description: 'Længere feature om livsstil, rejser og oplevelser',
      content: this.buildTemplateContent('Lifestyle', structure, examples, false),
      category: 'Lifestyle',
      tags: ['Lifestyle', 'Rejser', 'Oplevelser', 'Inspiration'],
      needsRating: false,
      structure,
      examples
    };
  }

  private optimizeProfileTemplate(): OptimizedTemplate {
    const profileArticles = this.articles.filter(a => 
      a.title.toLowerCase().includes('profil') ||
      a.content.toLowerCase().includes('profil') ||
      a.tags.some(tag => tag.toLowerCase().includes('profil'))
    );

    const structure = this.analyzeArticleStructure(profileArticles);
    const examples = this.getBestExamples(profileArticles, 'profil');

    return {
      id: 'profile-piece',
      name: 'Profil',
      description: 'Dybtgående portræt af en person',
      content: this.buildTemplateContent('Profil', structure, examples, false),
      category: 'Profil',
      tags: ['Profil', 'Person', 'Karriere', 'Inspiration'],
      needsRating: false,
      structure,
      examples
    };
  }

  private optimizeSocialTemplate(): OptimizedTemplate {
    const socialArticles = this.articles.filter(a => 
      a.category.toLowerCase().includes('samfund') ||
      a.tags.some(tag => 
        tag.toLowerCase().includes('samfund') ||
        tag.toLowerCase().includes('kommentar')
      )
    );

    const structure = this.analyzeArticleStructure(socialArticles);
    const examples = this.getBestExamples(socialArticles, 'samfund');

    return {
      id: 'social-commentary',
      name: 'Samfundskommentar',
      description: 'Refleksion over sociale tendenser og fænomener',
      content: this.buildTemplateContent('Samfund', structure, examples, false),
      category: 'Samfund',
      tags: ['Samfund', 'Tendenser', 'Kommentar', 'Analyse'],
      needsRating: false,
      structure,
      examples
    };
  }

  private optimizeCreativeTemplate(): OptimizedTemplate {
    const creativeArticles = this.articles.filter(a => 
      a.category.toLowerCase().includes('kreativ') ||
      a.tags.some(tag => 
        tag.toLowerCase().includes('kreativ') ||
        tag.toLowerCase().includes('essay')
      )
    );

    const structure = this.analyzeArticleStructure(creativeArticles);
    const examples = this.getBestExamples(creativeArticles, 'kreativ');

    return {
      id: 'creative-writing',
      name: 'Kreativ Skrivning',
      description: 'Fri kreativ skrivning og essays',
      content: this.buildTemplateContent('Kreativ', structure, examples, false),
      category: 'Kreativ',
      tags: ['Kreativ', 'Essay', 'Fri Skrivning', 'Kunst'],
      needsRating: false,
      structure,
      examples
    };
  }

  private analyzeArticleStructure(articles: AproposArticle[]): string[] {
    if (articles.length === 0) return [];

    // Analyze common patterns in article structure
    const commonPatterns: string[] = [];
    
    // Look for common opening patterns
    const openings = articles.map(a => a.content.substring(0, 200).toLowerCase());
    const commonOpenings = this.findCommonPatterns(openings);
    if (commonOpenings.length > 0) {
      commonPatterns.push(`Åbning: ${commonOpenings[0]}`);
    }

    // Look for common section headers or transitions
    const allContent = articles.map(a => a.content).join(' ');
    const transitions = this.findTransitionWords(allContent);
    if (transitions.length > 0) {
      commonPatterns.push(`Overgange: ${transitions.slice(0, 3).join(', ')}`);
    }

    return commonPatterns.length > 0 ? commonPatterns : [
      'Intro med hækling',
      'Hovedafsnit med uddybning',
      'Personlig refleksion',
      'Konklusion med call-to-action'
    ];
  }

  private getBestExamples(articles: AproposArticle[], category: string): string[] {
    // Get the most engaging examples based on title quality and content length
    const goodExamples = articles
      .filter(a => a.title.length > 10 && a.content.length > 500)
      .slice(0, 3)
      .map(a => a.title);
    
    return goodExamples.length > 0 ? goodExamples : [`Eksempel ${category} artikel`];
  }

  private buildTemplateContent(category: string, structure: string[], examples: string[], needsRating: boolean): string {
    const ratingNote = needsRating ? '\n**Rating:** 1-5 stjerner (vises kun for anmeldelser)' : '';
    
    return `**${category} Template**

**Kategori:** ${category}
**Tags:** ${this.getDefaultTags(category).join(', ')}${ratingNote}

**Struktur baseret på Apropos artikler:**
${structure.map((item, i) => `${i + 1}. ${item}`).join('\n')}

**Eksempler fra Apropos:**
${examples.map(ex => `- ${ex}`).join('\n')}

**Tone:** ${this.getToneForCategory(category)}

**Apropos stil-elementer:**
- Personlige refleksioner og anekdoter
- Kulturelle referencer og kontekst
- Ærlig og direkte tilgang
- Humor og ironi hvor det passer
- Fokus på oplevelse frem for teknik`;
  }

  private getDefaultTags(category: string): string[] {
    const tagMap: Record<string, string[]> = {
      'Gaming': ['Gaming', 'Anmeldelse', 'Spil'],
      'Kultur': ['Kultur', 'Anmeldelse', 'Film', 'Musik'],
      'Opinion': ['Opinion', 'Samfund', 'Debatter'],
      'Interview': ['Interview', 'Kunstner', 'Skaber'],
      'Nyheder': ['Nyheder', 'Analyse', 'Samfund'],
      'Tech': ['Tech', 'Gadgets', 'Apps'],
      'Lifestyle': ['Lifestyle', 'Rejser', 'Oplevelser'],
      'Profil': ['Profil', 'Person', 'Karriere'],
      'Samfund': ['Samfund', 'Tendenser', 'Kommentar'],
      'Kreativ': ['Kreativ', 'Essay', 'Fri Skrivning']
    };
    
    return tagMap[category] || [category];
  }

  private getToneForCategory(category: string): string {
    const toneMap: Record<string, string> = {
      'Gaming': 'Personlig, ærlig, humoristisk - Martin Kongstad x Casper Christensen stil',
      'Kultur': 'Reflekterende, personlig, kulturelt bevist',
      'Opinion': 'Engageret, velargumenteret, provokerende',
      'Interview': 'Nysgerrig, respektfuld, åben',
      'Nyheder': 'Balanceret, analytisk, informativ',
      'Tech': 'Teknisk, men tilgængelig, ærlig',
      'Lifestyle': 'Personlig, inspirerende, rejsende',
      'Profil': 'Respektfuld, nysgerrig, menneskelig',
      'Samfund': 'Reflekterende, analytisk, samfundsbevidst',
      'Kreativ': 'Kreativ, personlig, eksperimenterende'
    };
    
    return toneMap[category] || 'Apropos stil';
  }

  private findCommonPatterns(texts: string[]): string[] {
    // Simple pattern finding - look for common opening phrases
    const patterns: string[] = [];
    const firstWords = texts.map(text => text.split(' ').slice(0, 5).join(' '));
    
    const wordCounts = new Map<string, number>();
    firstWords.forEach(phrase => {
      if (phrase.length > 10) {
        wordCounts.set(phrase, (wordCounts.get(phrase) || 0) + 1);
      }
    });
    
    return Array.from(wordCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, _]) => pattern);
  }

  private findTransitionWords(content: string): string[] {
    const transitions = [
      'men', 'dog', 'imidlertid', 'derimod', 'på den anden side',
      'først', 'derefter', 'til sidst', 'endelig',
      'desuden', 'derudover', 'også', 'ligeledes',
      'derfor', 'altså', 'således', 'som følge'
    ];
    
    const foundTransitions: string[] = [];
    transitions.forEach(transition => {
      const regex = new RegExp(`\\b${transition}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches && matches.length > 5) {
        foundTransitions.push(transition);
      }
    });
    
    return foundTransitions;
  }

  async saveOptimizedTemplates(templates: OptimizedTemplate[]): Promise<void> {
    const outputDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const templatesFile = path.join(outputDir, 'optimized-templates.json');
    fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2));
    console.log(`💾 Saved ${templates.length} optimized templates to ${templatesFile}`);
  }
}

// Run the optimizer
async function main() {
  const optimizer = new TemplateOptimizer();
  await optimizer.loadScrapedData();
  const optimizedTemplates = optimizer.optimizeTemplates();
  await optimizer.saveOptimizedTemplates(optimizedTemplates);
  
  console.log('✅ Template optimization complete!');
  console.log('📊 Templates with rating:');
  optimizedTemplates.filter(t => t.needsRating).forEach(t => {
    console.log(`  - ${t.name} (${t.category})`);
  });
}

if (require.main === module) {
  main().catch(console.error);
}

export { TemplateOptimizer };
