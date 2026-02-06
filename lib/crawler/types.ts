export interface CrawlOptions {
  url: string;
  respectRobotsTxt: boolean;
  includeSubdomains: boolean;
  includePdfs: boolean;
  maxPages: number;
  concurrency: number;
  delayMs: number;
  maxDepth: number;
  ignorePaths: string[];
  stripTrackingParams: boolean;
}

export interface CrawlStatus {
  crawlId: string;
  status: 'idle' | 'crawling' | 'completed' | 'stopped' | 'error';
  startTime: number;
  endTime?: number;
  discoveredUrls: string[];
  completedUrls: string[];
  failedUrls: string[];
  currentUrl?: string;
  queueLength: number;
  pagesFound: number;
  pagesCrawled: number;
  error?: string;
}

export interface PageData {
  url: string;
  finalUrl: string;
  title: string;
  metaDescription?: string;
  text: string;
  status: 'queued' | 'crawling' | 'completed' | 'failed';
  error?: string;
  crawledAt?: number;
}

export interface CrawlSession {
  crawlId: string;
  options: CrawlOptions;
  status: CrawlStatus;
  pages: Map<string, PageData>;
  origin: string;
}
