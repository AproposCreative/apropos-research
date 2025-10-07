#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

interface TOVTrainingData {
  author: string;
  articleCount: number;
  toneOfVoice: string;
  writingStyle: string;
  commonThemes: string[];
  exampleSentences: string[];
  stylistics: {
    avgSentenceLength: number;
    usesHumor: boolean;
    usesIrony: boolean;
    usesPersonalPronouns: boolean;
    culturalReferences: number;
  };
  prompt: string;
}

class TOVTrainer {
  private articles: any[] = [];
  private authors: any[] = [];

  async loadData(): Promise<void> {
    const dataDir = path.join(process.cwd(), 'data');
    
    // Load articles
    const articlesFile = path.join(dataDir, 'apropos-articles.json');
    if (fs.existsSync(articlesFile)) {
      this.articles = JSON.parse(fs.readFileSync(articlesFile, 'utf8'));
      console.log(`📚 Loaded ${this.articles.length} articles`);
    }
    
    // Load authors
    const authorsFile = path.join(dataDir, 'apropos-authors.json');
    if (fs.existsSync(authorsFile)) {
      this.authors = JSON.parse(fs.readFileSync(authorsFile, 'utf8'));
      console.log(`👥 Loaded ${this.authors.length} authors`);
    }
  }

  trainTOV(): TOVTrainingData[] {
    console.log('🧠 Training TOV models...');
    
    const trainingData: TOVTrainingData[] = [];
    
    for (const author of this.authors) {
      if (author.articles.length < 3) continue; // Skip authors with too few articles
      
      console.log(`\n📝 Training ${author.name}...`);
      
      // Extract example sentences (opening lines, strong opinions, humor)
      const exampleSentences = this.extractExampleSentences(author.articles);
      
      // Analyze stylistics
      const stylistics = this.analyzeStylistics(author.articles);
      
      // Generate AI prompt for this author's TOV
      const prompt = this.generateTOVPrompt(author, exampleSentences, stylistics);
      
      const trainingEntry: TOVTrainingData = {
        author: author.name,
        articleCount: author.articles.length,
        toneOfVoice: author.toneOfVoice,
        writingStyle: author.writingStyle,
        commonThemes: author.commonThemes,
        exampleSentences,
        stylistics,
        prompt
      };
      
      trainingData.push(trainingEntry);
      
      console.log(`  ✓ ${exampleSentences.length} example sentences`);
      console.log(`  ✓ Avg sentence length: ${stylistics.avgSentenceLength} chars`);
      console.log(`  ✓ Humor: ${stylistics.usesHumor ? 'Yes' : 'No'}`);
      console.log(`  ✓ Irony: ${stylistics.usesIrony ? 'Yes' : 'No'}`);
    }
    
    return trainingData;
  }

  private extractExampleSentences(articles: any[]): string[] {
    const examples: string[] = [];
    
    articles.forEach(article => {
      const content = article.content || '';
      
      // Extract opening lines (usually best examples of tone)
      const sentences = content.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
      
      // First sentence (opening)
      if (sentences[0]) {
        examples.push(sentences[0].trim());
      }
      
      // Sentences with strong opinions (contains "aldrig", "altid", "måske", etc.)
      const opinionWords = ['aldrig', 'altid', 'måske', 'selvfølgelig', 'åbenlyst', 'desværre', 'heldigvis'];
      sentences.forEach((sentence: string) => {
        const lower = sentence.toLowerCase();
        if (opinionWords.some(word => lower.includes(word)) && sentence.length < 200) {
          examples.push(sentence.trim());
        }
      });
      
      // Sentences with humor indicators
      const humorIndicators = ['ironisk', 'sjovt', 'absurd', 'latterlig', 'bizart'];
      sentences.forEach((sentence: string) => {
        const lower = sentence.toLowerCase();
        if (humorIndicators.some(word => lower.includes(word)) && sentence.length < 200) {
          examples.push(sentence.trim());
        }
      });
    });
    
    // Deduplicate and return top examples
    return [...new Set(examples)].slice(0, 10);
  }

  private analyzeStylistics(articles: any[]): any {
    const allContent = articles.map(a => a.content || '').join(' ');
    const sentences = allContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    
    const lower = allContent.toLowerCase();
    const usesHumor = lower.includes('humor') || lower.includes('sjov') || lower.includes('latterfunktio');
    const usesIrony = lower.includes('ironi') || lower.includes('ironisk') || lower.includes('sarkastisk');
    const usesPersonalPronouns = (lower.match(/\bjeg\b/g) || []).length > 10;
    
    // Count cultural references (mentions of artists, films, etc.)
    const culturalReferences = (
      (lower.match(/\bfilm\b/g) || []).length +
      (lower.match(/\bmusik\b/g) || []).length +
      (lower.match(/\bkunstner\b/g) || []).length +
      (lower.match(/\bregissør\b/g) || []).length
    );
    
    return {
      avgSentenceLength: Math.round(avgSentenceLength),
      usesHumor,
      usesIrony,
      usesPersonalPronouns,
      culturalReferences
    };
  }

  private generateTOVPrompt(author: any, examples: string[], stylistics: any): string {
    return `Du er ${author.name}, journalist for Apropos Magazine.

**Din Tone of Voice:**
${author.toneOfVoice}

**Din Skrivstil:**
${author.writingStyle}

**Dine Styrker:**
- ${author.commonThemes.join('\n- ')}

**Sproglige Karakteristika:**
- Gennemsnitlig sætningslængde: ${stylistics.avgSentenceLength} tegn
- Bruger ${stylistics.usesHumor ? 'ofte' : 'sjældent'} humor
- Bruger ${stylistics.usesIrony ? 'ofte' : 'sjældent'} ironi
- ${stylistics.usesPersonalPronouns ? 'Meget personlig (bruger "jeg")' : 'Mindre personlig'}
- ${stylistics.culturalReferences > 50 ? 'Mange kulturelle referencer' : 'Moderate kulturelle referencer'}

**Eksempler på din skrivning:**
${examples.slice(0, 5).map((ex, i) => `${i + 1}. "${ex}"`).join('\n')}

**Instruktioner:**
- Skriv i ${author.name}'s stil
- Brug personlige anekdoter og refleksioner
- Vær ærlig og direkte
- Undgå klichéer og generiske formuleringer
- Fokuser på oplevelse frem for tekniske detaljer
- Brug kulturelle referencer naturligt
- Vær kritisk men konstruktiv

Skriv nu artiklen i denne stil.`;
  }

  async save(trainingData: TOVTrainingData[]): Promise<void> {
    const outputDir = path.join(process.cwd(), 'data');
    const outputFile = path.join(outputDir, 'apropos-tov-training.json');
    
    fs.writeFileSync(outputFile, JSON.stringify(trainingData, null, 2));
    console.log(`\n💾 Saved TOV training data to ${outputFile}`);
    
    // Also save individual author prompts
    const promptsDir = path.join(outputDir, 'author-prompts');
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }
    
    trainingData.forEach(data => {
      const authorSlug = data.author.toLowerCase().replace(/\s+/g, '-');
      const promptFile = path.join(promptsDir, `${authorSlug}.txt`);
      fs.writeFileSync(promptFile, data.prompt);
      console.log(`  ✓ ${data.author} prompt saved`);
    });
  }
}

// Run the trainer
async function main() {
  const trainer = new TOVTrainer();
  await trainer.loadData();
  const trainingData = trainer.trainTOV();
  await trainer.save(trainingData);
  
  console.log('\n✅ TOV training complete!');
  console.log(`📊 Trained ${trainingData.length} author voices`);
}

if (require.main === module) {
  main().catch(console.error);
}

export { TOVTrainer };

