// Shared utilities for media image search (TMDB, Google Images)
// These functions are used by both /api/search-media-image and /api/generate-image

export interface MediaSearchRequest {
  title: string;
  category?: string;
  section?: string;
  topic?: string;
  platform?: string;
  streaming_service?: string;
  content?: string;
}

// Detect if article is about film, TV series, or game
// Enhanced detection: Check section, category, topic, and platform
export function isMediaReview(data: MediaSearchRequest): { type: 'film' | 'tv' | 'game' | null; searchTerm: string } {
  const title = (data.title || '').toLowerCase();
  const category = (data.category || '').toLowerCase();
  const section = (data.section || '').toLowerCase();
  const topic = (data.topic || '').toLowerCase();
  const platform = (data.platform || data.streaming_service || '').toLowerCase();
  
  console.log('🔍 isMediaReview check (enhanced):', { title, category, section, topic, platform });
  
  // Check: If section or category is "Serier & Film" or similar
  const isSerierOgFilm = section.includes('serier & film') || 
                         section.includes('serier og film') ||
                         category.includes('serier & film') ||
                         category.includes('serier og film');
  
  // Check: If topic or category is "Gaming", "Film", or "TV-serier"
  const isGaming = topic.includes('gaming') || 
                   topic.includes('spil') ||
                   category.includes('gaming') ||
                   category.includes('spil');
  const isFilmTopic = topic.includes('film') || category.includes('film');
  const isTVTopic = topic.includes('tv-serier') || 
                    topic.includes('tv serier') || 
                    topic.includes('serie') ||
                    category.includes('tv-serier') ||
                    category.includes('serie');
  
  // Determine type based on section, category, or topic
  let type: 'film' | 'tv' | 'game' | null = null;
  
  if (isSerierOgFilm) {
    // If section/category is "Serier & Film", we need to determine if it's film or TV
    // Check topic first - if topic explicitly says "TV-serier" or "Serie", it's TV
    // Otherwise check if platform suggests TV (but only if topic doesn't explicitly say "Film")
    if (isTVTopic) {
      type = 'tv';
    } else if (isFilmTopic) {
      type = 'film';
    } else if (platform && ['netflix', 'hbo', 'disney', 'apple tv', 'prime video', 'hbo max', 'disney+', 'apple tv+'].some(p => platform.includes(p))) {
      // Platform suggests streaming - but for "Serier & Film" section, we need more context
      // Default to film unless topic explicitly says TV
      type = 'film'; // Default to film for "Serier & Film" section
    } else {
      // Default to film for "Serier & Film" section
      type = 'film';
    }
  } else if (isGaming) {
    type = 'game';
  } else if (isFilmTopic) {
    type = 'film';
  } else if (isTVTopic) {
    type = 'tv';
  }
  
  // Extract search term from title - clean it properly
  let searchTerm = data.title || '';
  
  // Remove common prefixes and suffixes
  searchTerm = searchTerm
    .replace(/\s*(anmeldelse|review|en|et)\s*$/i, '')
    .replace(/^(anmeldelse|review|en|et):\s*/i, '') // Remove prefix
    .trim();
  
  // Remove everything after colon (subtitle) - e.g. "Highest to Lowest: En B-film..." -> "Highest to Lowest"
  if (searchTerm.includes(':')) {
    searchTerm = searchTerm.split(':')[0].trim();
  }
  
  // Remove everything after dash - e.g. "Highest to Lowest - En B-film..." -> "Highest to Lowest"
  if (searchTerm.includes(' - ')) {
    searchTerm = searchTerm.split(' - ')[0].trim();
  }
  
  // Remove platform info in parentheses - e.g. "Highest to Lowest (Apple TV)" -> "Highest to Lowest"
  searchTerm = searchTerm.replace(/\s*\([^)]*\)\s*$/, '').trim();
  
  // Special handling for "Highest 2 Lowest" -> "Highest to Lowest"
  if (searchTerm.toLowerCase().includes('2') && (searchTerm.toLowerCase().includes('lowest') || searchTerm.toLowerCase().includes('highest'))) {
    searchTerm = searchTerm.replace(/\s*2\s*/i, ' to ');
  }
  
  // Translate Danish season/episode terms to English for better TMDB search
  searchTerm = searchTerm
    .replace(/\s*sæson\s*/gi, ' Season ')
    .replace(/\s*afsnit\s*/gi, ' Episode ')
    .replace(/\s*del\s+/gi, ' Part ')
    .trim();
  
  // Also try "High and Low" as alternative (the original Japanese title)
  // But only if search fails, so we'll handle that in searchTMDB
  
  console.log(`🔍 Detected type: ${type}, search term: "${searchTerm}"`);
  return { type, searchTerm };
}

// Search TMDB for film/TV poster
export async function searchTMDB(searchTerm: string, type: 'film' | 'tv', skipIndex: number = 0): Promise<string | null> {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      console.log('⚠️ TMDB_API_KEY not set, skipping TMDB search');
      return null;
    }
    
    const endpoint = type === 'film' 
      ? `https://api.themoviedb.org/3/search/movie`
      : `https://api.themoviedb.org/3/search/tv`;
    
    // Try multiple search variations
    const searchVariations = [
      searchTerm, // Original
      searchTerm.replace(/\s*2\s*/i, ' to '), // "Highest 2 Lowest" -> "Highest to Lowest"
      searchTerm.replace(/\s*to\s*/i, ' 2 '), // Reverse
    ];
    
    // Extract season/episode numbers for TV shows
    const seasonMatch = searchTerm.match(/season\s+(\d+)/i);
    const episodeMatch = searchTerm.match(/episode\s+(\d+)/i);
    const seasonNum = seasonMatch ? seasonMatch[1] : null;
    const episodeNum = episodeMatch ? episodeMatch[1] : null;
    
    // If we have season info, create variations without it (series name only)
    if (seasonNum) {
      const seriesName = searchTerm.replace(/\s*season\s*\d+/i, '').trim();
      if (seriesName) {
        searchVariations.push(seriesName); // Just the series name
        searchVariations.push(`${seriesName} Season ${seasonNum}`); // Ensure proper format
        searchVariations.push(`${seriesName} S${seasonNum}`); // Short format
        searchVariations.push(`${seriesName} S0${seasonNum}`); // With leading zero
      }
    }
    
    // Remove episode numbers for better search (TMDB searches by series, not individual episodes)
    if (episodeNum) {
      const withoutEpisode = searchTerm.replace(/\s*episode\s*\d+/i, '').trim();
      if (withoutEpisode && !searchVariations.includes(withoutEpisode)) {
        searchVariations.push(withoutEpisode);
      }
    }
    
    // For "Highest to Lowest" - also try "High and Low" (the original Japanese title it's based on)
    if (searchTerm.toLowerCase().includes('highest') && searchTerm.toLowerCase().includes('lowest')) {
      searchVariations.push('High and Low');
      searchVariations.push('High and Low 2024'); // In case it's listed with year
      searchVariations.push('High and Low 2025'); // In case it's listed with year
    }
    
    // Remove duplicates and empty strings
    const uniqueVariations = Array.from(new Set(searchVariations.filter(v => v && v.trim().length > 0)));
    
    for (const variation of uniqueVariations) {
      const url = `${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(variation)}&language=da-DK`;
      console.log(`🔍 Searching TMDB for ${type}: "${variation}"`);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ TMDB API error: ${response.status} - ${errorText}`);
        continue; // Try next variation
      }
      
      const data = await response.json();
      const results = data.results || [];
      
      if (results.length === 0) {
        console.log(`⚠️ No TMDB results for: ${variation}`);
        continue; // Try next variation
      }
      
      // Get result at skipIndex (or first if skipIndex is out of bounds)
      // This allows cycling through different images for the same title
      const resultIndex = Math.min(skipIndex, results.length - 1);
      const selectedResult = results[resultIndex];
      
      if (resultIndex > 0) {
        console.log(`🔄 Using result #${resultIndex + 1} (skipped ${skipIndex}): "${selectedResult.title || selectedResult.name}"`);
      }
      
      // Try backdrop first (16:9 format, better for web display)
      // If no backdrop, fall back to poster
      const backdropPath = selectedResult.backdrop_path;
      const posterPath = selectedResult.poster_path;
      
      let imageUrl: string | null = null;
      
      if (backdropPath) {
        // Use backdrop image (16:9 format) - perfect for web display
        // TMDB backdrop sizes: w300, w780, w1280, original
        // original is full resolution (usually 1920x1080 or similar) - perfect for 16:9 display
        imageUrl = `https://image.tmdb.org/t/p/original${backdropPath}`;
        console.log(`✅ Found TMDB ${type} backdrop (16:9, original resolution) for: ${variation} (${selectedResult.title || selectedResult.name})`);
      } else if (posterPath) {
        // Fallback to poster if no backdrop available
        // Use original for poster (posters are 2:3 ratio, not 16:9, but we want full quality)
        imageUrl = `https://image.tmdb.org/t/p/original${posterPath}`;
        console.log(`⚠️ No backdrop found, using poster (2:3, original resolution) for: ${variation} (${selectedResult.title || selectedResult.name})`);
      } else {
        console.log(`⚠️ No backdrop or poster path for: ${variation}`);
        continue; // Try next variation
      }
      
      return imageUrl;
    }
    
    console.log(`⚠️ No TMDB results found for any variation of: ${searchTerm}`);
    return null;
  } catch (error) {
    console.error('❌ TMDB search error:', error);
    return null;
  }
}

// Search Google Images for game artwork (requires Google Custom Search API)
export async function searchGoogleImages(searchTerm: string): Promise<string | null> {
  try {
    const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
      console.log('⚠️ Google Custom Search API not configured, skipping Google search');
      return null;
    }
    
    // Search for official artwork/screenshots without text
    const query = `${searchTerm} official artwork screenshot no text`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&searchType=image&num=5&safe=active`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`❌ Google Custom Search API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const items = data.items || [];
    
    if (items.length === 0) {
      console.log(`⚠️ No Google Images results for: ${searchTerm}`);
      return null;
    }
    
    // Try to find images without text overlay (heuristic: larger images, from official sources)
    const bestImage = items.find((item: any) => {
      const link = item.link || '';
      const source = (item.displayLink || '').toLowerCase();
      // Prefer official sources
      return source.includes('steam') || 
             source.includes('epicgames') || 
             source.includes('playstation') || 
             source.includes('xbox') || 
             source.includes('nintendo') ||
             (item.image?.width > 800 && item.image?.height > 600); // Larger images less likely to have text
    }) || items[0];
    
    const imageUrl = bestImage.link;
    console.log(`✅ Found Google Images result for: ${searchTerm}`);
    return imageUrl;
  } catch (error) {
    console.error('❌ Google Images search error:', error);
    return null;
  }
}

