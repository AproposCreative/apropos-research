import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonlPath = resolve(__dirname, '../../prompts/rage_prompts.jsonl');
const outDir    = resolve(__dirname, '../public/data');
const outFile   = resolve(outDir, 'rage_prompts.json');

if (!existsSync(jsonlPath)) {
  console.warn('⚠️ Fandt ikke', jsonlPath, '- bruger tom data');
  // Create empty data file for deployment
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify([], null, 2));
  console.log('✅ Skrev', outFile, '(0 poster)');
  process.exit(0);
}

// Read and parse JSONL data
const lines = readFileSync(jsonlPath, 'utf8')
  .split(/\r?\n/).filter(Boolean)
  .map((l, i) => {
    try { return JSON.parse(l); }
    catch { console.warn('ignorerer defekt linje', i); return null; }
  })
  .filter(Boolean);

// Process data using readPrompts logic
function parseDateFromSummary(summary) {
  if (!summary) return null;
  
  // Look for Danish date patterns like "8. sep. 2025" or "15. januar 2024"
  const danishDatePattern = /(\d{1,2})\.\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\.?\s*(\d{4})/i;
  const match = summary.match(danishDatePattern);
  
  if (match) {
    const day = parseInt(match[1]);
    const monthMap = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'maj': '05', 'jun': '06', 'jul': '07', 'aug': '08',
      'sep': '09', 'okt': '10', 'nov': '11', 'dec': '12'
    };
    const month = monthMap[match[2].toLowerCase()];
    const year = match[3];
    
    if (month) {
      return `${year}-${month}-${day.toString().padStart(2, '0')}T00:00:00.000Z`;
    }
  }
  
  return null;
}

function analyzeContentForCategory(title, summary, bullets) {
  const text = `${title || ''} ${summary || ''} ${(bullets || []).join(' ')}`.toLowerCase();
  
  if (text.includes('musik') || text.includes('album') || text.includes('koncert') || text.includes('band') || text.includes('sang') || text.includes('artist')) {
    return 'musik';
  }
  if (text.includes('film') || text.includes('serie') || text.includes('netflix') || text.includes('disney') || text.includes('cinema') || text.includes('skuespiller')) {
    return 'film';
  }
  if (text.includes('gaming') || text.includes('spil') || text.includes('playstation') || text.includes('xbox') || text.includes('nintendo') || text.includes('pc')) {
    return 'gaming';
  }
  if (text.includes('sport') || text.includes('fodbold') || text.includes('tennis') || text.includes('olympics') || text.includes('atletik')) {
    return 'sport';
  }
  if (text.includes('politik') || text.includes('regering') || text.includes('valg') || text.includes('minister') || text.includes('folketing')) {
    return 'politik';
  }
  if (text.includes('økonomi') || text.includes('børs') || text.includes('inflation') || text.includes('bank') || text.includes('finans')) {
    return 'økonomi';
  }
  if (text.includes('teknologi') || text.includes('ai') || text.includes('tech') || text.includes('smartphone') || text.includes('computer')) {
    return 'teknologi';
  }
  return 'nyheder';
}

// Group and process data
const grouped = new Map();
for (const item of lines) {
  const key = item.url;
  if (!grouped.has(key)) {
    const title = item.title || '';
    const category = analyzeContentForCategory(title, item.summary, item.bullets);
    const parsedDate = parseDateFromSummary(item.summary) || item.created_at;
    
    let source = 'unknown';
    if (item.url?.includes('soundvenue.com')) source = 'soundvenue';
    else if (item.url?.includes('gaffa.dk')) source = 'gaffa';
    else if (item.url?.includes('berlingske.dk')) source = 'berlingske';
    else if (item.url?.includes('bt.dk')) source = 'bt';
    else if (item.url?.includes('politiken.dk')) source = 'politiken';
    else if (item.url?.includes('ekstrabladet.dk')) source = 'ekstrabladet';
    else if (item.url?.includes('dr.dk')) source = 'dr';
    else if (item.url?.includes('bbc.com')) source = 'bbc';
    else if (item.url?.includes('cnn.com')) source = 'cnn';
    else if (item.url?.includes('reuters.com')) source = 'reuters';
    else if (item.url?.includes('theguardian.com')) source = 'theguardian';
    else if (item.url?.includes('nytimes.com')) source = 'nytimes';
    else if (item.url?.includes('washingtonpost.com')) source = 'washingtonpost';
    else if (item.url?.includes('ign.com')) source = 'ign';
    else if (item.url?.includes('imdb.com')) source = 'imdb';
    else if (item.url?.includes('techcrunch.com')) source = 'techcrunch';
    else if (item.url?.includes('theverge.com')) source = 'theverge';
    else if (item.url?.includes('polygon.com')) source = 'polygon';
    else if (item.url?.includes('kotaku.com')) source = 'kotaku';
    else if (item.url?.includes('gamespot.com')) source = 'gamespot';
    else if (item.url?.includes('engadget.com')) source = 'engadget';
    else if (item.url?.includes('arstechnica.com')) source = 'arstechnica';
    
    grouped.set(key, {
      title: title,
      url: item.url,
      date: parsedDate,
      published_at: parsedDate,
      fetched_at: item.created_at,
      category: category,
      bullets: item.bullets || [],
      summary: item.summary || "",
      chunks: [],
      image: item.image,
      source: source,
    });
  }
  
  const g = grouped.get(key);
  
  // Add chunk if it exists
  if (typeof item.chunk_index === "number" && typeof item.chunk_text === "string") {
    g.chunks.push({ chunk_id: String(item.chunk_index), text: item.chunk_text });
  }
  
  // Update image if it exists and we don't have one yet
  if (item.image && !g.image) {
    g.image = item.image;
  }
}

const processedData = Array.from(grouped.values());

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(processedData, null, 2));
console.log('✅ Skrev', outFile, '(', processedData.length, 'poster )');
