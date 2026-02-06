// lib/crawler/registry.ts
import { WebsiteCrawler } from './crawler';

// Store active crawlers to stop them
const activeCrawlers: Map<string, WebsiteCrawler> = new Map();

export function registerCrawler(crawlId: string, crawler: WebsiteCrawler) {
  activeCrawlers.set(crawlId, crawler);
}

export function unregisterCrawler(crawlId: string) {
  activeCrawlers.delete(crawlId);
}

export function getCrawler(crawlId: string): WebsiteCrawler | undefined {
  return activeCrawlers.get(crawlId);
}
