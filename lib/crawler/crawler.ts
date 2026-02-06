import PQueue from 'p-queue';
import { chromium, Browser } from 'playwright';
import robotsParser from 'robots-parser';
import { crawlStore } from './store';
import { normalizeUrl, getOrigin, shouldIgnoreUrl, isValidUrl } from './url-utils';
import { discoverLinksFromHtml, discoverLinksFromSitemap, findSitemapUrl } from './discovery';
import { extractTextFromHtml, extractTextWithPlaywright, needsPlaywright } from './extractor';
import { CrawlOptions, PageData } from './types';

export class WebsiteCrawler {
  private browser: Browser | null = null;
  private queue: PQueue | null = null;
  private crawlId: string;
  private options: CrawlOptions;
  private origin: string;
  private visited: Set<string> = new Set();
  private robotsParser: ReturnType<typeof robotsParser> | null = null;
  private isStopped: boolean = false;

  constructor(crawlId: string, options: CrawlOptions) {
    this.crawlId = crawlId;
    this.options = options;
    this.origin = getOrigin(options.url);
  }

  async initialize(): Promise<void> {
    console.log(`[Crawler] Initializing crawler for ${this.crawlId} with URL: ${this.options.url}`);
    
    // Initialize Playwright browser (lazy, only if needed)
    // We'll create it on-demand

    // Check robots.txt if enabled
    if (this.options.respectRobotsTxt) {
      try {
        const robotsUrl = new URL('/robots.txt', this.options.url).toString();
        console.log(`[Crawler] Fetching robots.txt from: ${robotsUrl}`);
        const response = await fetch(robotsUrl, {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const robotsTxt = await response.text();
          this.robotsParser = robotsParser(robotsUrl, robotsTxt);
          console.log(`[Crawler] robots.txt parsed successfully`);
        } else {
          console.log(`[Crawler] robots.txt not found or not accessible (${response.status})`);
        }
      } catch (error) {
        console.warn('[Crawler] Could not fetch robots.txt:', error);
      }
    }

    // Initialize queue with concurrency and delay
    this.queue = new PQueue({
      concurrency: this.options.concurrency,
      interval: this.options.delayMs,
      intervalCap: 1,
    });
    console.log(`[Crawler] Queue initialized with concurrency: ${this.options.concurrency}, delay: ${this.options.delayMs}ms`);
  }

  async start(): Promise<void> {
    console.log(`[Crawler] Starting crawl initialization for crawlId: ${this.crawlId}`);
    await this.initialize();
    console.log(`[Crawler] Initialization complete for crawlId: ${this.crawlId}`);

    // Wait a bit and retry if session not found (race condition protection)
    let session = crawlStore.getSession(this.crawlId);
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelayMs = 200;

    while (!session && retryCount < maxRetries) {
      console.log(`[Crawler] Session not found for ${this.crawlId}, retrying in ${retryDelayMs}ms... (Attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      session = crawlStore.getSession(this.crawlId);
      retryCount++;
    }
    
    if (!session) {
      console.error(`[Crawler] Session not found after ${maxRetries} retries for crawlId: ${this.crawlId}`);
      throw new Error('Session not found');
    }
    
    console.log(`[Crawler] Session found, starting crawl for: ${session.options.url}`);

    crawlStore.updateStatus(this.crawlId, { status: 'crawling' });

    // Normalize and add starting URL
    const startUrl = normalizeUrl(this.options.url, this.options.stripTrackingParams);
    this.visited.add(startUrl);

    // Try to find and parse sitemap
    if (this.options.respectRobotsTxt && this.robotsParser) {
      const sitemaps = this.robotsParser.getSitemaps();
      for (const sitemap of sitemaps) {
        try {
          const links = await discoverLinksFromSitemap(sitemap, this.options);
          for (const link of links) {
            if (!this.visited.has(link)) {
              this.visited.add(link);
              session.status.discoveredUrls.push(link);
            }
          }
        } catch (error) {
          console.warn('Error parsing sitemap:', error);
        }
      }
    } else {
      // Try common sitemap location
      const sitemapUrl = await findSitemapUrl(this.options.url);
      if (sitemapUrl) {
        try {
          const links = await discoverLinksFromSitemap(sitemapUrl, this.options);
          for (const link of links) {
            if (!this.visited.has(link)) {
              this.visited.add(link);
              session.status.discoveredUrls.push(link);
            }
          }
        } catch (error) {
          console.warn('Error parsing sitemap:', error);
        }
      }
    }

    // Add starting URL to queue
    this.queue!.add(() => this.crawlPage(startUrl, 0));

    // Process discovered URLs from sitemap
    for (const url of session.status.discoveredUrls) {
      if (this.isStopped) break;
      const depth = this.calculateDepth(url, startUrl);
      if (depth <= this.options.maxDepth && !this.visited.has(url)) {
        this.visited.add(url);
        this.queue!.add(() => this.crawlPage(url, depth));
      }
    }

    // Wait for queue to finish (with timeout to handle new URLs being discovered)
    let idleCount = 0;
    while (!this.isStopped && idleCount < 3) {
      await this.queue!.onIdle();
      // Check if new URLs were discovered while processing
      const currentSession = crawlStore.getSession(this.crawlId);
      if (currentSession) {
        const newUrls = currentSession.status.discoveredUrls.filter(
          url => !this.visited.has(url) && 
          this.calculateDepth(url, startUrl) <= this.options.maxDepth
        );
        
        if (newUrls.length > 0) {
          idleCount = 0;
          for (const url of newUrls) {
            if (this.isStopped) break;
            this.visited.add(url);
            this.queue!.add(() => this.crawlPage(url, this.calculateDepth(url, startUrl)));
          }
        } else {
          idleCount++;
          // Small delay before checking again
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else {
        break;
      }
    }

    // Cleanup
    await this.cleanup();

    // Update final status
    const finalSession = crawlStore.getSession(this.crawlId);
    if (finalSession && !this.isStopped) {
      crawlStore.updateStatus(this.crawlId, {
        status: 'completed',
        endTime: Date.now(),
      });
    }
  }

  private async crawlPage(url: string, depth: number): Promise<void> {
    if (this.isStopped) return;

    const session = crawlStore.getSession(this.crawlId);
    if (!session) return;

    // Check limits
    if (session.status.pagesCrawled >= this.options.maxPages) {
      return;
    }

    // Check robots.txt
    if (this.robotsParser && !this.robotsParser.isAllowed(url, '*')) {
      return;
    }

    // Update status
    crawlStore.updateStatus(this.crawlId, {
      currentUrl: url,
      queueLength: this.queue?.pending || 0,
    });

    const pageData: PageData = {
      url,
      finalUrl: url,
      title: '',
      text: '',
      status: 'crawling',
    };

    crawlStore.addPage(this.crawlId, url, pageData);

    try {
      // Fetch page
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WebsiteTextCrawler/1.0)',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        throw new Error('Not HTML content');
      }

      const html = await response.text();
      const finalUrl = response.url;

      // Check if we need Playwright
      let extracted;
      if (needsPlaywright(html)) {
        if (!this.browser) {
          this.browser = await chromium.launch({ headless: true });
        }
        const page = await this.browser.newPage();
        try {
          extracted = await extractTextWithPlaywright(page, finalUrl);
        } finally {
          await page.close();
        }
      } else {
        extracted = extractTextFromHtml(html, finalUrl);
      }

      // Discover new links
      const links = await discoverLinksFromHtml(html, finalUrl, this.options);
      const newLinks: string[] = [];
      
      for (const link of links) {
        if (!this.visited.has(link) && depth < this.options.maxDepth) {
          this.visited.add(link);
          session.status.discoveredUrls.push(link);
          newLinks.push(link);
        }
      }

      // Add new links to queue if we haven't hit limits
      if (session.status.discoveredUrls.length < this.options.maxPages * 2) {
        for (const link of newLinks) {
          if (this.isStopped) break;
          this.queue!.add(() => this.crawlPage(link, depth + 1));
        }
      }

      // Update page data
      pageData.finalUrl = finalUrl;
      pageData.title = extracted.title;
      pageData.metaDescription = extracted.metaDescription;
      pageData.text = extracted.text;
      pageData.status = 'completed';
      pageData.crawledAt = Date.now();

      crawlStore.addPage(this.crawlId, url, pageData);

      // Update status
      session.status.pagesCrawled++;
      session.status.completedUrls.push(url);
      session.status.pagesFound = session.status.discoveredUrls.length;

      crawlStore.updateStatus(this.crawlId, {
        pagesCrawled: session.status.pagesCrawled,
        pagesFound: session.status.pagesFound,
        queueLength: this.queue?.pending || 0,
      });
    } catch (error: any) {
      pageData.status = 'failed';
      pageData.error = error.message || 'Unknown error';
      crawlStore.addPage(this.crawlId, url, pageData);

      session.status.failedUrls.push(url);
      crawlStore.updateStatus(this.crawlId, {
        failedUrls: session.status.failedUrls,
      });
    }
  }

  private calculateDepth(url: string, baseUrl: string): number {
    try {
      const basePath = new URL(baseUrl).pathname;
      const urlPath = new URL(url).pathname;
      
      const baseParts = basePath.split('/').filter(p => p);
      const urlParts = urlPath.split('/').filter(p => p);
      
      // Count how many path segments differ
      let depth = 0;
      for (let i = 0; i < urlParts.length; i++) {
        if (i >= baseParts.length || urlParts[i] !== baseParts[i]) {
          depth++;
        }
      }
      
      return depth;
    } catch {
      return 0;
    }
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    await this.queue?.clear();
    await this.cleanup();
    
    crawlStore.updateStatus(this.crawlId, {
      status: 'stopped',
      endTime: Date.now(),
    });
  }

  private async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
