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
  const source = url ? new URL(url).hostname.replace('www.', '') : undefined;
  
  // Extract category from URL path
  let category = raw?.category ? String(raw.category).trim() : undefined;
  if (!category && url) {
    const pathParts = new URL(url).pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const firstPart = pathParts[0].toLowerCase();
      if (['musik', 'film', 'gaming', 'anmeldelser', 'nyheder', 'politik', 'økonomi', 'teknologi'].includes(firstPart)) {
        category = firstPart;
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

export async function readPrompts(): Promise<RageItem[]> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (promptsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return promptsCache;
  }
  
  const fallback = "/Users/fred/Library/CloudStorage/Dropbox/AproposMagazine.com/13. Onkel Ragekniv/prompts/rage_prompts.jsonl";
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
  
  // sort newest first by date/fetched_at
  items.sort((a, b) => {
    const aa = Date.parse(a.date ?? a.fetched_at ?? "") || 0;
    const bb = Date.parse(b.date ?? b.fetched_at ?? "") || 0;
    return bb - aa;
  });
  
  // Cache the results
  promptsCache = items;
  cacheTimestamp = now;
  
  return items;
}