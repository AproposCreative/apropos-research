import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

// Intelligent Content Analysis for Categorization
function analyzeContentForCategory(title: string, summary: string, bullets: string[]): string | null {
  const text = `${title} ${summary} ${bullets.join(' ')}`.toLowerCase();
  
  // Music-related keywords
  const musicKeywords = [
    'musik', 'album', 'koncert', 'band', 'sanger', 'sang', 'hit', 'single', 'plade', 'cd', 'vinyl',
    'festival', 'scene', 'guitar', 'piano', 'drum', 'bass', 'vokal', 'melodi', 'rytme', 'beat',
    'pop', 'rock', 'jazz', 'klassisk', 'elektronisk', 'hip hop', 'rap', 'country', 'folk',
    'gaffa', 'soundvenue', 'musikmagasinet', 'anmeldelse', 'musikvideo', 'streaming', 'spotify'
  ];
  
  // Film/TV-related keywords
  const filmKeywords = [
    'film', 'serie', 'tv', 'skuespiller', 'skuespillerinde', 'instruktør', 'producent', 'cinema',
    'biograf', 'netflix', 'hbo', 'disney', 'marvel', 'dc', 'anime', 'dokumentar', 'thriller',
    'komedie', 'drama', 'action', 'horror', 'romantik', 'science fiction', 'fantasy', 'krimi',
    'premiere', 'trailer', 'oscar', 'golden globe', 'cannes', 'sundance', 'festival'
  ];
  
  // Gaming-related keywords
  const gamingKeywords = [
    'spil', 'gaming', 'playstation', 'xbox', 'nintendo', 'pc', 'steam', 'esports', 'streaming',
    'twitch', 'youtube gaming', 'minecraft', 'fortnite', 'call of duty', 'fifa', 'pokemon',
    'nintendo switch', 'ps5', 'xbox series', 'vr', 'virtual reality', 'gamer', 'pro gamer',
    'tournament', 'championship', 'league', 'team', 'clan', 'guild', 'raid', 'quest'
  ];
  
  // Technology-related keywords
  const techKeywords = [
    'teknologi', 'ai', 'artificial intelligence', 'chatgpt', 'openai', 'machine learning',
    'smartphone', 'iphone', 'android', 'samsung', 'apple', 'google', 'microsoft', 'amazon',
    'tesla', 'elon musk', 'spacex', 'crypto', 'bitcoin', 'blockchain', 'nft', 'metaverse',
    'vr', 'ar', 'augmented reality', 'quantum', 'robot', 'automation', 'startup', 'innovation'
  ];
  
  // Sports-related keywords
  const sportsKeywords = [
    'sport', 'fodbold', 'fodbold', 'champions league', 'premier league', 'bundesliga',
    'olympics', 'vm', 'em', 'europamesterskab', 'verdensmesterskab', 'atletik', 'swimming',
    'cykling', 'tennis', 'golf', 'basketball', 'håndbold', 'volleyball', 'badminton',
    'boxing', 'mma', 'ufc', 'formula 1', 'rally', 'motorsport', 'esport', 'fitness'
  ];
  
  // Politics-related keywords
  const politicsKeywords = [
    'politik', 'regering', 'folketing', 'valg', 'parti', 'minister', 'statsminister',
    'mps', 'parlament', 'demokrati', 'valgkamp', 'kandidat', 'mandat', 'koalition',
    'opposition', 'lovforslag', 'budget', 'skat', 'sundhed', 'uddannelse', 'miljø',
    'klima', 'energi', 'transport', 'infrastruktur', 'sikkerhed', 'forsvar', 'udland'
  ];
  
  // Business/Economy-related keywords
  const businessKeywords = [
    'økonomi', 'børs', 'aktie', 'investering', 'bank', 'finans', 'krise', 'recession',
    'inflation', 'rente', 'valuta', 'krone', 'euro', 'dollar', 'bitcoin', 'crypto',
    'startup', 'venture capital', 'ipo', 'fusion', 'overtagelse', 'konkurs', 'arbejdsløshed',
    'løn', 'pension', 'forsikring', 'ejendom', 'bolig', 'leje', 'køb', 'salg'
  ];
  
  // Count keyword matches
  const musicScore = musicKeywords.filter(keyword => text.includes(keyword)).length;
  const filmScore = filmKeywords.filter(keyword => text.includes(keyword)).length;
  const gamingScore = gamingKeywords.filter(keyword => text.includes(keyword)).length;
  const techScore = techKeywords.filter(keyword => text.includes(keyword)).length;
  const sportsScore = sportsKeywords.filter(keyword => text.includes(keyword)).length;
  const politicsScore = politicsKeywords.filter(keyword => text.includes(keyword)).length;
  const businessScore = businessKeywords.filter(keyword => text.includes(keyword)).length;
  
  // Find the category with the highest score
  const scores = [
    { category: 'musik', score: musicScore },
    { category: 'film', score: filmScore },
    { category: 'gaming', score: gamingScore },
    { category: 'teknologi', score: techScore },
    { category: 'sport', score: sportsScore },
    { category: 'politik', score: politicsScore },
    { category: 'økonomi', score: businessScore }
  ];
  
  // Sort by score and return the highest scoring category if it has at least 1 match
  scores.sort((a, b) => b.score - a.score);
  
  if (scores[0].score > 0) {
    return scores[0].category;
  }
  
  // If no specific category matches, return null to fall back to URL-based categorization
  return null;
}

export type PromptItem = {
  title: string; url: string; date?: string; fetched_at?: string;
  category?: string; bullets: string[]; summary: string;
  chunks?: { chunk_id: string; text: string }[];
  image?: string; source?: string;
};

export async function readPrompts(): Promise<PromptItem[]> {
  // 1) Forsøg lokalt JSONL
  try {
    const p = resolve(process.cwd(), '../prompts/rage_prompts.jsonl');
    const raw = await fs.readFile(p, 'utf8');
    const list = raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    return normalize(list);
  } catch {}

  // 2) Hosted fallback -> public/data JSON
  try {
    const p = resolve(process.cwd(), 'public/data/rage_prompts.json');
    const raw = await fs.readFile(p, 'utf8');
    const list = JSON.parse(raw);
    return normalize(list);
  } catch {}

  return [];
}

function normalize(arr: any[]): PromptItem[] {
  // Group by URL to combine chunks
  const grouped = new Map<string, any>();
  
  for (const item of arr ?? []) {
    const key = item.url || `about:blank#${Math.random()}`;
    
    if (!grouped.has(key)) {
      // Extract title from summary if no title field exists
      const title = item.title || (item.summary ? item.summary.split('.')[0] : "");
      
      // Intelligent Content-Based Categorization
      const intelligentCategory = analyzeContentForCategory(title, item.summary || '', item.bullets || []);
      
      // Extract category from URL path - use actual categories from URLs
      let urlCategory = item.url?.match(/\/\/(?:www\.)?soundvenue\.com\/([^\/]+)/)?.[1];
      let gaffaCategory = item.url?.match(/\/\/(?:www\.)?gaffa\.dk\/([^\/]+)/)?.[1];
      let berlingskeCategory = item.url?.match(/\/\/(?:www\.)?berlingske\.dk\/([^\/]+)/)?.[1];
      let btCategory = item.url?.match(/\/\/(?:www\.)?bt\.dk\/([^\/]+)/)?.[1];
      
      // International sources category mapping
      let internationalCategory = '';
      if (item.url?.includes('wired.com')) {
        const path = item.url?.match(/\/\/(?:www\.)?wired\.com\/([^\/]+)/)?.[1];
        if (path === 'category' || path === 'tag') {
          const subPath = item.url?.split('/')[4];
          if (subPath === 'gaming' || subPath === 'games') internationalCategory = 'gaming';
          else if (subPath === 'entertainment' || subPath === 'movies') internationalCategory = 'film';
          else if (subPath === 'music') internationalCategory = 'musik';
          else internationalCategory = 'nyheder';
        } else internationalCategory = 'nyheder';
      } else if (item.url?.includes('ign.com')) {
        const path = item.url?.match(/\/\/(?:www\.)?ign\.com\/([^\/]+)/)?.[1];
        if (path === 'games' || path === 'gaming') internationalCategory = 'gaming';
        else if (path === 'movies' || path === 'tv') internationalCategory = 'film';
        else if (path === 'music') internationalCategory = 'musik';
        else internationalCategory = 'nyheder';
      } else if (item.url?.includes('imdb.com')) {
        internationalCategory = 'film';
      } else if (item.url?.includes('techcrunch.com') || item.url?.includes('theverge.com') || item.url?.includes('engadget.com') || item.url?.includes('arstechnica.com')) {
        internationalCategory = 'nyheder';
      } else if (item.url?.includes('polygon.com') || item.url?.includes('kotaku.com') || item.url?.includes('gamespot.com')) {
        internationalCategory = 'gaming';
      }
      
      // Prioritize intelligent categorization, then URL-based, then international mapping
      const category = intelligentCategory || item.category || urlCategory || gaffaCategory || berlingskeCategory || btCategory || internationalCategory || 'nyheder';
      
      // Use created_at as fallback for date
      const date = item.published_at || item.date || item.created_at;
      
      // Determine source from URL (always override to fix existing data)
      let source = item.source;
      if (item.url?.includes('soundvenue.com')) source = 'soundvenue';
      else if (item.url?.includes('gaffa.dk')) source = 'gaffa';
      else if (item.url?.includes('berlingske.dk')) source = 'berlingske';
      else if (item.url?.includes('bt.dk')) source = 'bt';
      else if (item.url?.includes('wired.com')) source = 'wired';
      else if (item.url?.includes('ign.com')) source = 'ign';
      else if (item.url?.includes('imdb.com')) source = 'imdb';
      else if (item.url?.includes('techcrunch.com')) source = 'techcrunch';
      else if (item.url?.includes('theverge.com')) source = 'theverge';
      else if (item.url?.includes('polygon.com')) source = 'polygon';
      else if (item.url?.includes('kotaku.com')) source = 'kotaku';
      else if (item.url?.includes('gamespot.com')) source = 'gamespot';
      else if (item.url?.includes('engadget.com')) source = 'engadget';
      else if (item.url?.includes('arstechnica.com')) source = 'arstechnica';
      else source = 'unknown';
      
      grouped.set(key, {
        title: title,
        url: item.url,
        date: date || item.created_at,
        published_at: item.published_at || item.created_at,
        fetched_at: item.fetched_at || item.created_at,
        category: category,
        bullets: item.bullets || [],
        summary: item.summary || "",
        chunks: [],
        image: item.image,
        source: source,
      });
    }
    
    const g = grouped.get(key)!;
    
    // Add chunk if it exists
    if (typeof item.chunk_index === "number" && typeof item.chunk_text === "string") {
      g.chunks.push({ chunk_id: String(item.chunk_index), text: item.chunk_text });
    }
    
    // Update image if it exists and we don't have one yet
    if (item.image && !g.image) {
      g.image = item.image;
    }
  }
  
  return Array.from(grouped.values());
}


