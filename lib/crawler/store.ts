import { CrawlSession, CrawlStatus, PageData } from './types';

class CrawlStore {
  private sessions: Map<string, CrawlSession> = new Map();
  private readonly MAX_SESSIONS = 100;
  private readonly SESSION_TTL = 2 * 60 * 60 * 1000; // 2 hours
  private readonly COMPLETED_SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours for completed sessions

  createSession(crawlId: string, options: any, origin: string): CrawlSession {
    // Only cleanup if we're getting close to the limit
    // Don't cleanup on every session creation to avoid deleting active sessions
    if (this.sessions.size > this.MAX_SESSIONS * 0.8) {
      this.cleanup();
    }
    
    const session: CrawlSession = {
      crawlId,
      options,
      origin,
      status: {
        crawlId,
        status: 'idle',
        startTime: Date.now(),
        discoveredUrls: [],
        completedUrls: [],
        failedUrls: [],
        queueLength: 0,
        pagesFound: 0,
        pagesCrawled: 0,
      },
      pages: new Map(),
    };
    
    this.sessions.set(crawlId, session);
    console.log(`[Store] Session created: ${crawlId}, total sessions: ${this.sessions.size}`);
    
    // Verify it was stored
    const verify = this.sessions.get(crawlId);
    if (!verify) {
      console.error(`[Store] CRITICAL: Session was not stored! crawlId: ${crawlId}`);
    }
    
    return session;
  }

  getSession(crawlId: string): CrawlSession | undefined {
    // Don't cleanup on read - only on write operations
    const session = this.sessions.get(crawlId);
    if (!session) {
      console.warn(`[Store] Session not found: ${crawlId}, total sessions: ${this.sessions.size}`);
      console.warn(`[Store] Available session IDs:`, Array.from(this.sessions.keys()).slice(0, 5));
    }
    return session;
  }

  updateStatus(crawlId: string, updates: Partial<CrawlStatus>): void {
    const session = this.sessions.get(crawlId);
    if (session) {
      session.status = { ...session.status, ...updates };
    }
  }

  addPage(crawlId: string, url: string, pageData: PageData): void {
    const session = this.sessions.get(crawlId);
    if (session) {
      session.pages.set(url, pageData);
    }
  }

  getPage(crawlId: string, url: string): PageData | undefined {
    const session = this.sessions.get(crawlId);
    return session?.pages.get(url);
  }

  getAllPages(crawlId: string): PageData[] {
    const session = this.sessions.get(crawlId);
    if (!session) return [];
    return Array.from(session.pages.values());
  }

  deleteSession(crawlId: string): void {
    this.sessions.delete(crawlId);
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [crawlId, session] of this.sessions.entries()) {
      const age = now - session.status.startTime;
      // Keep completed/stopped sessions for 24 hours
      if (session.status.status === 'completed' || session.status.status === 'stopped') {
        if (age > this.COMPLETED_SESSION_TTL) {
          toDelete.push(crawlId);
        }
      } else if (age > this.SESSION_TTL) {
        // Active sessions expire after 2 hours
        toDelete.push(crawlId);
      }
    }
    
    // If we have too many sessions, delete oldest non-completed ones first
    // Only delete completed sessions if we're really over the limit
    if (this.sessions.size > this.MAX_SESSIONS) {
      const sorted = Array.from(this.sessions.entries())
        .sort((a, b) => {
          // Sort by: active sessions first (to delete), then by age
          const aCompleted = a[1].status.status === 'completed' || a[1].status.status === 'stopped';
          const bCompleted = b[1].status.status === 'completed' || b[1].status.status === 'stopped';
          if (aCompleted && !bCompleted) return 1; // Completed sessions last
          if (!aCompleted && bCompleted) return -1; // Active sessions first
          return a[1].status.startTime - b[1].status.startTime; // Oldest first
        });
      
      // Only delete enough to get back under the limit
      const toDeleteCount = this.sessions.size - this.MAX_SESSIONS;
      for (const [crawlId] of sorted.slice(0, toDeleteCount)) {
        toDelete.push(crawlId);
      }
    }
    
    if (toDelete.length > 0) {
      console.log(`[Store] Cleaning up ${toDelete.length} old sessions`);
      for (const crawlId of toDelete) {
        this.sessions.delete(crawlId);
      }
    }
  }
}

export const crawlStore = new CrawlStore();
