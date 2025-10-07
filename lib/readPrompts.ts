// server-only reader for ../prompts/rage_prompts.jsonl
import fs from "node:fs";
import path from "node:path";

export type RageChunk = { chunk_id?: string; text: string };
export type RageItem = {
  title: string;
  url: string;
  date?: string;
  fetched_at?: string;
  category?: string;
  source?: string;
  image?: string;
  bullets: string[];
  summary: string;
  chunks: RageChunk[];
};

const coerceItem = (raw: any): RageItem => {
  const url = String(raw?.url ?? "").trim();
  // Use existing source field if available, otherwise derive from URL
  const source = raw?.source ? String(raw.source).trim() : (url ? new URL(url).hostname.replace('www.', '') : undefined);
  
  // Extract category from URL path
  let category = raw?.category ? String(raw.category).trim() : undefined;
  if (!category && url) {
    const pathParts = new URL(url).pathname.split('/').filter(Boolean);
    
    // Check for Danish categories first
    if (pathParts.length > 0) {
      const firstPart = pathParts[0].toLowerCase();
      if (['musik', 'film', 'gaming', 'anmeldelser', 'nyheder', 'politik', 'økonomi', 'teknologi'].includes(firstPart)) {
        category = firstPart;
      }
    }
    
    // Check for English categories (IGN Nordic, etc.)
    if (!category && pathParts.length > 2) {
      const categoryPart = pathParts[2].toLowerCase();
      
      // Map English categories to Danish
      if (['news', 'article'].includes(categoryPart)) {
        category = 'nyheder';
      } else if (['preview', 'review'].includes(categoryPart)) {
        category = 'anmeldelser';
      } else if (['deal', 'deals'].includes(categoryPart)) {
        category = 'nyheder'; // Tech deals fall under news
      } else if (['video'].includes(categoryPart)) {
        category = 'nyheder'; // Videos fall under news
      } else if (['guide', 'guides'].includes(categoryPart)) {
        category = 'nyheder'; // Guides fall under news
      } else if (['feature', 'features'].includes(categoryPart)) {
        category = 'nyheder'; // Features fall under news
      } else if (['gallery', 'galleries'].includes(categoryPart)) {
        category = 'nyheder'; // Galleries fall under news
      } else if (['interview', 'interviews'].includes(categoryPart)) {
        category = 'nyheder'; // Interviews fall under news
      } else if (['list', 'lists'].includes(categoryPart)) {
        category = 'nyheder'; // Lists fall under news
      }
    }
    
    // Check for gaming-related content in URL path or title
    if (!category) {
      const fullPath = new URL(url).pathname.toLowerCase();
      const title = String(raw?.title ?? "").toLowerCase();
      
      // Gaming keywords - more comprehensive
      const gamingKeywords = [
        'game', 'gaming', 'nintendo', 'xbox', 'playstation', 'steam', 'pc', 'console',
        'rpg', 'fps', 'action', 'adventure', 'strategy', 'simulation', 'racing',
        'call of duty', 'battlefield', 'halo', 'pokemon', 'mario', 'zelda',
        'final fantasy', 'world of warcraft', 'minecraft', 'fortnite', 'league of legends',
        'dota', 'counter-strike', 'valorant', 'overwatch', 'destiny', 'fallout',
        'elder scrolls', 'witcher', 'cyberpunk', 'assassin', 'tomb raider',
        'resident evil', 'silent hill', 'devil may cry', 'bayonetta', 'god of war',
        'uncharted', 'last of us', 'horizon', 'spider-man', 'batman', 'superman'
      ];
      
      const hasGamingKeyword = gamingKeywords.some(keyword => 
        fullPath.includes(keyword) || title.includes(keyword)
      );
      
      if (hasGamingKeyword) {
        category = 'gaming';
      }
    }
  }
  
  return {
    title: String(raw?.title ?? "").trim(),
    url,
    date: raw?.date ? String(raw.date) : undefined,
    fetched_at: raw?.fetched_at ? String(raw.fetched_at) : (raw?.created_at ? String(raw.created_at) : undefined),
    category,
    source,
    image: raw?.image ? String(raw.image) : undefined,
    bullets: Array.isArray(raw?.bullets) ? raw.bullets.map((b: any) => String(b)) : [],
    summary: String(raw?.summary ?? ""),
    chunks: Array.isArray(raw?.chunks)
      ? raw.chunks.map((c: any) => ({ chunk_id: c?.chunk_id, text: String(c?.text ?? "") }))
      : [],
  };
};

// Cache for readPrompts to avoid repeated file reads
let promptsCache: RageItem[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Function to invalidate cache
export function invalidatePromptsCache(): void {
  promptsCache = null;
  cacheTimestamp = 0;
}

export async function readPrompts(): Promise<RageItem[]> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (promptsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return promptsCache;
  }
  
  const fallback = path.resolve(process.cwd(), "prompts/rage_prompts.jsonl");
  const file = process.env.RAGE_PROMPTS_PATH
    ? path.resolve(process.env.RAGE_PROMPTS_PATH)
    : fallback;

  if (!fs.existsSync(file)) {
    // Return mock data for deployment when file doesn't exist
    return [
      {
        title: "Velkommen til Apropos Research Platform",
        url: "https://apropos-research.vercel.app",
        date: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
        category: "nyheder",
        source: "apropos-research",
        image: undefined,
        bullets: ["Platform er klar til brug", "Avanceret søgning tilgængelig", "Alle funktioner er aktive"],
        summary: "Velkommen til Apropos Research Platform - din avancerede søge- og opdagelsesplatform for danske medier.",
        chunks: []
      },
      {
        title: "Avanceret Søgning og Opdagelse",
        url: "https://apropos-research.vercel.app/search",
        date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        fetched_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        category: "teknologi",
        source: "apropos-research",
        image: undefined,
        bullets: ["Semantisk søgning", "Relaterede artikler", "Gemte søgninger"],
        summary: "Udforsk vores avancerede søgefunktioner med semantisk søgning, relaterede artikler og gemte søgninger.",
        chunks: []
      },
      {
        title: "Dashboard og Oversigt",
        url: "https://apropos-research.vercel.app",
        date: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        fetched_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        category: "nyheder",
        source: "apropos-research",
        image: undefined,
        bullets: ["Oversigt over artikler", "Statistikker", "Hurtige handlinger"],
        summary: "Få et overblik over alle artikler og statistikker på vores intuitive dashboard.",
        chunks: []
      }
    ];
  }
  
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  
  const items: RageItem[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      items.push(coerceItem(obj));
    } catch { /* skip bad line */ }
  }
  
  // Remove duplicates based on URL (most reliable identifier)
  const uniqueItems = items.reduce((acc: RageItem[], item: RageItem) => {
    const existingItem = acc.find(existing => existing.url === item.url);
    if (!existingItem) {
      acc.push(item);
    } else {
      // If we find a duplicate, keep the one with more recent date/fetched_at
      const existingDate = Date.parse(existingItem.date ?? existingItem.fetched_at ?? "") || 0;
      const currentDate = Date.parse(item.date ?? item.fetched_at ?? "") || 0;
      
      if (currentDate > existingDate) {
        // Replace with the more recent version
        const index = acc.indexOf(existingItem);
        acc[index] = item;
      }
    }
    return acc;
  }, []);
  
  // sort newest first by date/fetched_at
  uniqueItems.sort((a, b) => {
    const aa = Date.parse(a.date ?? a.fetched_at ?? "") || 0;
    const bb = Date.parse(b.date ?? b.fetched_at ?? "") || 0;
    return bb - aa;
  });
  
  // Cache the results
  promptsCache = uniqueItems;
  cacheTimestamp = now;
  
  return uniqueItems;
}