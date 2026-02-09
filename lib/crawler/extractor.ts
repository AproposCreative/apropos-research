import * as cheerio from 'cheerio';
import { Page } from 'playwright';

export interface ExtractedText {
  title: string;
  metaDescription?: string;
  text: string;
}

/**
 * Extract readable text from HTML using cheerio (fast path)
 */
export function extractTextFromHtml(html: string, url: string): ExtractedText {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, nav, footer, header, aside, .nav, .navigation, .footer, .header, .sidebar, .menu, .cookie-banner, .cookie-consent, [role="navigation"], [role="banner"], [role="complementary"]').remove();

  // Get title
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';

  // Get meta description
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim();

  // Try to find main content area
  let content = $('main, article, [role="main"], .content, .main-content, .post-content, .entry-content, #content, #main');

  if (content.length === 0) {
    // Fallback: use body but exclude common non-content elements
    content = $('body');
    content.find('header, footer, nav, aside, .header, .footer, .nav, .sidebar, .menu').remove();
  }

  // Extract text with structure
  const textParts: string[] = [];

  // Add headings in order
  content.find('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      const tagName = $(el).prop('tagName') || (el as any).name || 'h1';
      const tag = tagName.toLowerCase();
      const level = parseInt(tag.substring(1));
      const prefix = '#'.repeat(level) + ' ';
      textParts.push(prefix + text);
    }
  });

  // Add paragraphs
  content.find('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) { // Filter out very short paragraphs
      textParts.push(text);
    }
  });

  // Add list items
  content.find('li').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 5) {
      textParts.push('• ' + text);
    }
  });

  // Fallback: if we didn't get much content, extract all text
  if (textParts.length < 3) {
    const allText = content.text().trim();
    if (allText.length > 50) {
      // Split into paragraphs by double newlines
      const paragraphs = allText.split(/\n\s*\n/).filter(p => p.trim().length > 20);
      textParts.push(...paragraphs);
    }
  }

  // Clean and join text
  const cleanText = textParts
    .map(text => text.trim())
    .filter(text => text.length > 0)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();

  return {
    title,
    metaDescription,
    text: cleanText || 'No readable content found.',
  };
}

/**
 * Extract text using Playwright (for JS-rendered pages)
 */
export async function extractTextWithPlaywright(
  page: Page,
  url: string
): Promise<ExtractedText> {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    // Wait a bit for content to render
    await page.waitForTimeout(1000);

    // Get HTML and extract
    const html = await page.content();
    return extractTextFromHtml(html, url);
  } catch (error) {
    throw new Error(`Failed to extract text with Playwright: ${error}`);
  }
}

/**
 * Check if page seems to be JS-rendered (has little text in initial HTML)
 */
export function needsPlaywright(html: string): boolean {
  const $ = cheerio.load(html);
  
  // Remove scripts and styles
  $('script, style').remove();
  
  // Check if there's substantial text content
  const text = $('body').text().trim();
  const textLength = text.length;
  
  // If less than 500 chars, likely needs JS rendering
  if (textLength < 500) {
    return true;
  }
  
  // Check for common JS framework indicators
  const hasReactRoot = $('[id*="root"], [id*="app"], [id*="__next"]').length > 0;
  const hasMinimalContent = $('main, article, [role="main"]').length === 0;
  
  return hasReactRoot && hasMinimalContent && textLength < 1000;
}
