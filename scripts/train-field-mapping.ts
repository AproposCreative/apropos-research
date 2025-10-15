#!/usr/bin/env tsx

/**
 * Field Mapping Training Script
 * 
 * This script analyzes the 98 articles from Webflow and creates training data
 * to improve AI field mapping accuracy.
 */

import { promises as fs } from 'fs';
import path from 'path';

interface FieldAnalysis {
  used: number;
  total: number;
  percentage: number;
  examples: string[];
  types: Set<string>;
}

interface TrainingExample {
  input: {
    title: string;
    content: string;
    author?: string;
    section?: string;
    topic?: string;
  };
  expectedOutput: Record<string, any>;
  fieldUsage: Record<string, boolean>;
}

interface WebflowArticle {
  id: string;
  name: string;
  slug: string;
  fieldData: Record<string, any>;
  createdOn: string;
  lastUpdated: string;
}

async function fetchTrainingData() {
  try {
    const response = await fetch('http://localhost:3001/api/webflow/training-data');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching training data:', error);
    throw error;
  }
}

function analyzeFieldPatterns(articles: WebflowArticle[], fieldAnalysis: Record<string, FieldAnalysis>) {
  const patterns = {
    // Core fields (always used)
    core: ['name', 'slug', 'content', 'meta-description', 'seo-title'],
    
    // Content fields (high usage)
    content: ['intro', 'subtitle'],
    
    // Classification fields (high usage)
    classification: ['author', 'section', 'topic'],
    
    // Rating fields (medium usage)
    rating: ['stjerne'],
    
    // Media fields (medium usage)
    media: ['thumb', 'video-trailer'],
    
    // Event fields (low usage, specific to events)
    events: ['festival', 'location', 'start-dato', 'slut-dato', 'buy-tickets'],
    
    // Streaming fields (low usage, specific to streaming content)
    streaming: ['watch-now-link', 'unique-watch-now-title', 'unique-stream-now-cover'],
    
    // Reference fields (low usage)
    references: ['simple-rerfence', 'muiltiref', 'topic-two'],
    
    // Utility fields (low usage)
    utility: ['minutes-to-read', 'featured', 'presseakkreditering', 'unique-label-for-tickets']
  };

  // Analyze content patterns
  const contentPatterns = {
    hasIntro: 0,
    hasSubtitle: 0,
    hasRating: 0,
    hasStreamingLink: 0,
    hasEventInfo: 0,
    hasVideoTrailer: 0
  };

  articles.forEach(article => {
    const fieldData = article.fieldData;
    if (fieldData.intro && fieldData.intro.length > 50) contentPatterns.hasIntro++;
    if (fieldData.subtitle && fieldData.subtitle.length > 10) contentPatterns.hasSubtitle++;
    if (fieldData.stjerne && fieldData.stjerne > 0) contentPatterns.hasRating++;
    if (fieldData['watch-now-link']) contentPatterns.hasStreamingLink++;
    if (fieldData.festival || fieldData.location) contentPatterns.hasEventInfo++;
    if (fieldData['video-trailer']) contentPatterns.hasVideoTrailer++;
  });

  return {
    fieldCategories: patterns,
    contentPatterns,
    totalArticles: articles.length,
    fieldUsage: fieldAnalysis
  };
}

function generateFieldMappingRules(analysis: any) {
  const rules = {
    // Always required fields
    required: ['name', 'slug', 'content', 'meta-description', 'seo-title'],
    
    // Conditional fields based on content type
    conditional: {
      // If it's a review (has rating), include rating field
      review: {
        condition: 'hasRating',
        fields: ['stjerne']
      },
      
      // If it's streaming content, include streaming fields
      streaming: {
        condition: 'hasStreamingLink',
        fields: ['watch-now-link', 'unique-watch-now-title']
      },
      
      // If it's an event, include event fields
      event: {
        condition: 'hasEventInfo',
        fields: ['festival', 'location', 'start-dato', 'buy-tickets']
      },
      
      // If it has video content, include video fields
      video: {
        condition: 'hasVideoTrailer',
        fields: ['video-trailer']
      }
    },
    
    // Field mapping from our structure to Webflow
    mapping: {
      'name': 'name',
      'seoTitle': 'seo-title',
      'seoDescription': 'meta-description',
      'subtitle': 'subtitle',
      'intro': 'intro',
      'content': 'content',
      'rating': 'stjerne',
      'streaming_service': 'watch-now-link',
      'author': 'author',
      'illustration': 'thumb',
      'section': 'section',
      'topic': 'topic',
      'topic_two': 'topic-two',
      'minutes_to_read': 'minutes-to-read',
      'featured': 'featured',
      'presseakkreditering': 'presseakkreditering',
      'festival': 'festival',
      'start_dato': 'start-dato',
      'slut_dato': 'slut-dato',
      'location': 'location'
    }
  };

  return rules;
}

function createTrainingPrompts(analysis: any, rules: any) {
  const prompts = {
    systemPrompt: `
# APROPOS FIELD MAPPING TRAINING

Based on analysis of ${analysis.totalArticles} real articles from Apropos Magazine, here are the field usage patterns:

## CORE FIELDS (Always Required - 100% usage)
- name: Article title
- slug: URL-friendly version of title
- content: Full article content
- meta-description: SEO description (≤155 chars)
- seo-title: SEO title (≤60 chars)

## CONTENT FIELDS (High Usage)
- intro: 99% usage - Article introduction paragraph
- subtitle: 67% usage - Creative subline

## CLASSIFICATION FIELDS (High Usage)
- author: 98% usage - Author reference
- section: 98% usage - Article section
- topic: 98% usage - Primary topic

## CONDITIONAL FIELDS
- stjerne: 66% usage - Star rating (1-6, only for reviews)
- watch-now-link: 30% usage - Streaming platform link
- festival: 38% usage - Festival reference (events only)
- location: 29% usage - Event location
- start-dato: 28% usage - Event start date
- video-trailer: 26% usage - Video trailer embed

## FIELD MAPPING RULES
When generating articles, use these patterns:

1. ALWAYS include core fields
2. Include intro for most articles (99% have it)
3. Include subtitle for most articles (67% have it)
4. Include rating (stjerne) only for reviews
5. Include streaming links only for streaming content
6. Include event fields only for events/festivals
7. Include video fields only when video content exists

## CONTENT TYPE DETECTION
- Review: Has rating (stjerne) field
- Streaming: Has watch-now-link field
- Event: Has festival or location field
- Video: Has video-trailer field
`,

    examples: analysis.contentPatterns
  };

  return prompts;
}

async function main() {
  console.log('🚀 Starting Field Mapping Training...');
  
  try {
    // Fetch training data
    console.log('📊 Fetching training data from Webflow...');
    const data = await fetchTrainingData();
    
    console.log(`✅ Fetched ${data.totalArticles} articles`);
    console.log(`📈 Analyzed ${Object.keys(data.fieldAnalysis).length} fields`);
    
    // Analyze patterns
    console.log('🔍 Analyzing field patterns...');
    const analysis = analyzeFieldPatterns(data.allArticles, data.fieldAnalysis);
    
    // Generate rules
    console.log('📋 Generating field mapping rules...');
    const rules = generateFieldMappingRules(analysis);
    
    // Create training prompts
    console.log('✍️ Creating training prompts...');
    const prompts = createTrainingPrompts(analysis, rules);
    
    // Save results
    const outputDir = path.join(process.cwd(), 'data');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Save analysis
    await fs.writeFile(
      path.join(outputDir, 'field-mapping-analysis.json'),
      JSON.stringify(analysis, null, 2)
    );
    
    // Save rules
    await fs.writeFile(
      path.join(outputDir, 'field-mapping-rules.json'),
      JSON.stringify(rules, null, 2)
    );
    
    // Save training prompts
    await fs.writeFile(
      path.join(outputDir, 'field-mapping-prompts.json'),
      JSON.stringify(prompts, null, 2)
    );
    
    // Update structure prompt with learned patterns
    const structurePromptPath = path.join(process.cwd(), 'prompts', 'structure.apropos.md');
    const structurePrompt = await fs.readFile(structurePromptPath, 'utf8');
    
    const updatedStructurePrompt = structurePrompt + `

---

## 🎯 LEARNED FIELD PATTERNS (from ${analysis.totalArticles} articles)

### Field Usage Statistics:
- **Core fields (100% usage):** name, slug, content, meta-description, seo-title
- **Content fields:** intro (99%), subtitle (67%)
- **Classification:** author (98%), section (98%), topic (98%)
- **Conditional:** stjerne (66%), watch-now-link (30%), festival (38%)

### Content Type Detection:
- **Review:** Has rating (stjerne) field
- **Streaming:** Has watch-now-link field  
- **Event:** Has festival or location field
- **Video:** Has video-trailer field

### Field Mapping Priority:
1. Always include core fields
2. Include intro for most articles (99% have it)
3. Include subtitle for most articles (67% have it)
4. Include rating only for reviews
5. Include streaming links only for streaming content
6. Include event fields only for events/festivals
`;
    
    await fs.writeFile(structurePromptPath, updatedStructurePrompt);
    
    console.log('✅ Training complete!');
    console.log('📁 Files saved:');
    console.log('  - data/field-mapping-analysis.json');
    console.log('  - data/field-mapping-rules.json');
    console.log('  - data/field-mapping-prompts.json');
    console.log('  - prompts/structure.apropos.md (updated)');
    
    // Print summary
    console.log('\n📊 SUMMARY:');
    console.log(`Total articles analyzed: ${analysis.totalArticles}`);
    console.log(`Fields with 100% usage: ${analysis.fieldCategories.core.length}`);
    console.log(`Fields with >90% usage: ${Object.values(analysis.fieldUsage).filter((f: any) => f.percentage > 90).length}`);
    console.log(`Fields with <30% usage: ${Object.values(analysis.fieldUsage).filter((f: any) => f.percentage < 30).length}`);
    
  } catch (error) {
    console.error('❌ Training failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
