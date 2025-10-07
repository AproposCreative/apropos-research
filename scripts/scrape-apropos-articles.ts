#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

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

class AproposScraper {
  private baseUrl = 'https://www.aproposmagazine.com';
  private articles: AproposArticle[] = [];
  private authors: Map<string, AuthorProfile> = new Map();

  async scrapeAllArticles(): Promise<void> {
    console.log('🚀 Starting Apropos Magazine article scraping...');
    
    try {
      // First, get all article URLs from sitemap or main pages
      const articleUrls = await this.getAllArticleUrls();
      console.log(`📚 Found ${articleUrls.length} articles to scrape`);
      
      // Scrape each article
      for (let i = 0; i < articleUrls.length; i++) {
        const url = articleUrls[i];
        console.log(`📖 Scraping ${i + 1}/${articleUrls.length}: ${url}`);
        
        try {
          const article = await this.scrapeArticle(url);
          if (article) {
            this.articles.push(article);
            
            // Add to author profile
            if (!this.authors.has(article.author)) {
              this.authors.set(article.author, {
                name: article.author,
                articles: [],
                writingStyle: '',
                commonThemes: [],
                averageLength: 0,
                toneOfVoice: ''
              });
            }
            
            this.authors.get(article.author)!.articles.push(article);
          }
          
          // Rate limiting - be nice to their server
          await this.delay(1000);
        } catch (error) {
          console.error(`❌ Error scraping ${url}:`, error);
        }
      }
      
      // Analyze writing styles for each author
      await this.analyzeAuthorStyles();
      
      // Save results
      await this.saveResults();
      
      console.log('✅ Scraping complete!');
      console.log(`📊 Total articles: ${this.articles.length}`);
      console.log(`👥 Authors found: ${this.authors.size}`);
      
    } catch (error) {
      console.error('❌ Scraping failed:', error);
    }
  }

  private async getAllArticleUrls(): Promise<string[]> {
    const urls: string[] = [];
    
    try {
      // Try to get from sitemap first
      const sitemapUrls = await this.getUrlsFromSitemap();
      if (sitemapUrls.length > 0) {
        console.log(`🗺️ Found ${sitemapUrls.length} URLs from sitemap`);
        return sitemapUrls;
      }
      
      // Fallback: scrape from main pages
      console.log('📄 Getting URLs from main pages...');
      const mainPages = [
        '/',
        '/articles',
        '/category/gaming',
        '/category/kultur',
        '/category/tech',
        '/category/opinion'
      ];
      
      for (const page of mainPages) {
        const pageUrls = await this.getUrlsFromPage(`${this.baseUrl}${page}`);
        urls.push(...pageUrls);
      }
      
    } catch (error) {
      console.error('❌ Error getting URLs:', error);
    }
    
    // Remove duplicates
    return [...new Set(urls)];
  }

  private async getUrlsFromSitemap(): Promise<string[]> {
    try {
      const sitemapUrl = `${this.baseUrl}/sitemap.xml`;
      const response = await axios.get(sitemapUrl);
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      const urls: string[] = [];
      $('loc').each((_, element) => {
        const url = $(element).text();
        if (url.includes('/articles/') && !url.includes('/tag/') && !url.includes('/author/')) {
          urls.push(url);
        }
      });
      
      return urls;
    } catch (error) {
      console.log('⚠️ Could not access sitemap, trying alternative method');
      return [];
    }
  }

  private async getUrlsFromPage(pageUrl: string): Promise<string[]> {
    try {
      const response = await axios.get(pageUrl);
      const $ = cheerio.load(response.data);
      
      const urls: string[] = [];
      $('a[href*="/articles/"]').each((_, element) => {
        const href = $(element).attr('href');
        if (href && !href.includes('/tag/') && !href.includes('/author/')) {
          const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
          urls.push(fullUrl);
        }
      });
      
      return urls;
    } catch (error) {
      console.error(`❌ Error getting URLs from ${pageUrl}:`, error);
      return [];
    }
  }

  private async scrapeArticle(url: string): Promise<AproposArticle | null> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AproposResearch/1.0)'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract article data using Webflow-specific selectors
      const title = $('h1.main-title').text().trim() || 
                   $('h1').first().text().trim() || 
                   $('title').text().trim();
      
      // Author is in .text_label inside .short-info__wrap
      const author = $('.short-info__wrap .text_label').first().text().trim() ||
                    $('meta[name="author"]').attr('content') ||
                    'Unknown Author';
      
      // Content is in .blog-content or .w-richtext
      const content = $('.blog-content').text().trim() ||
                     $('.w-richtext').text().trim() ||
                     $('.post-content').text().trim() ||
                     $('article').text().trim() ||
                     '';
      
      // Category from .category-absolute or .text_label
      const category = $('.category-absolute').text().trim() ||
                      $('.short-info__wrap .text_label').eq(1).text().trim() ||
                      'Generel';
      
      // Date from meta tags or .text_label
      const date = $('meta[property="article:published_time"]').attr('content') ||
                  $('meta[name="date"]').attr('content') ||
                  $('.published-date').text().trim() ||
                  new Date().toISOString();
      
      // Tags from .text_label in .short-info__wrap
      const tags: string[] = [];
      $('.short-info__wrap .text_label').each((_, element) => {
        const tag = $(element).text().trim();
        if (tag && tag !== author && tag !== category && tag.length > 2) {
          tags.push(tag);
        }
      });
      
      // Get excerpt from meta description or first paragraph
      const excerpt = $('meta[name="description"]').attr('content') ||
                     content.substring(0, 200).trim() + '...';
      
      if (!title || !content || content.length < 100) {
        console.log(`⚠️ Skipping ${url}: title="${title}", content length=${content.length}`);
        return null;
      }
      
      return {
        url,
        title,
        author,
        category,
        content,
        date,
        tags,
        excerpt
      };
      
    } catch (error) {
      console.error(`❌ Error scraping article ${url}:`, error);
      return null;
    }
  }

  private async analyzeAuthorStyles(): Promise<void> {
    console.log('🔍 Analyzing author writing styles...');
    
    for (const [authorName, profile] of this.authors) {
      if (profile.articles.length < 3) continue; // Need at least 3 articles for analysis
      
      // Analyze writing patterns
      const allContent = profile.articles.map(a => a.content).join(' ');
      const averageLength = Math.round(allContent.length / profile.articles.length);
      
      // Extract common themes
      const allTags = profile.articles.flatMap(a => a.tags);
      const tagCounts = new Map<string, number>();
      allTags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
      const commonThemes = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);
      
      // Analyze writing style
      const writingStyle = this.analyzeWritingStyle(allContent);
      const toneOfVoice = this.analyzeToneOfVoice(allContent);
      
      profile.averageLength = averageLength;
      profile.commonThemes = commonThemes;
      profile.writingStyle = writingStyle;
      profile.toneOfVoice = toneOfVoice;
      
      console.log(`👤 ${authorName}: ${profile.articles.length} articles, ${averageLength} chars avg, themes: ${commonThemes.join(', ')}`);
    }
  }

  private analyzeWritingStyle(content: string): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    
    const shortSentences = sentences.filter(s => s.length < 50).length;
    const longSentences = sentences.filter(s => s.length > 100).length;
    
    let style = '';
    if (avgSentenceLength < 60) style += 'Korte, præcise sætninger. ';
    if (avgSentenceLength > 80) style += 'Længere, uddybende sætninger. ';
    if (shortSentences > longSentences) style += 'Punchy stil. ';
    if (longSentences > shortSentences) style += 'Refleksiv stil. ';
    
    return style.trim();
  }

  private analyzeToneOfVoice(content: string): string {
    const lowercaseContent = content.toLowerCase();
    
    let tone = '';
    if (lowercaseContent.includes('jeg ') || lowercaseContent.includes(' jeg')) tone += 'Personlig, ';
    if (lowercaseContent.includes('vi ') || lowercaseContent.includes(' vi')) tone += 'Inkluderende, ';
    if (lowercaseContent.includes('!')) tone += 'Engageret, ';
    if (lowercaseContent.includes('?')) tone += 'Nysgerrig, ';
    if (lowercaseContent.includes('men ') || lowercaseContent.includes(' dog')) tone += 'Reflekterende, ';
    if (lowercaseContent.includes('faktisk') || lowercaseContent.includes('virkelig')) tone += 'Ærlig, ';
    
    return tone.replace(/,\s*$/, '') || 'Professionel';
  }

  private async saveResults(): Promise<void> {
    const outputDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save all articles
    const articlesFile = path.join(outputDir, 'apropos-articles.json');
    fs.writeFileSync(articlesFile, JSON.stringify(this.articles, null, 2));
    console.log(`💾 Saved ${this.articles.length} articles to ${articlesFile}`);
    
    // Save author profiles
    const authorsFile = path.join(outputDir, 'apropos-authors.json');
    const authorsArray = Array.from(this.authors.values());
    fs.writeFileSync(authorsFile, JSON.stringify(authorsArray, null, 2));
    console.log(`👥 Saved ${authorsArray.length} author profiles to ${authorsFile}`);
    
    // Save analysis summary
    const summary = {
      totalArticles: this.articles.length,
      totalAuthors: this.authors.size,
      categories: this.getCategoryStats(),
      authors: authorsArray.map(a => ({
        name: a.name,
        articleCount: a.articles.length,
        averageLength: a.averageLength,
        commonThemes: a.commonThemes,
        toneOfVoice: a.toneOfVoice
      }))
    };
    
    const summaryFile = path.join(outputDir, 'apropos-analysis.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`📊 Saved analysis summary to ${summaryFile}`);
  }

  private getCategoryStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.articles.forEach(article => {
      stats[article.category] = (stats[article.category] || 0) + 1;
    });
    return stats;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the scraper
async function main() {
  const scraper = new AproposScraper();
  await scraper.scrapeAllArticles();
}

if (require.main === module) {
  main().catch(console.error);
}

export { AproposScraper };
