/**
 * AI-based relevance filtering for Apropos Magazine content
 * Filters articles based on Apropos' focus areas: concerts, festivals, TV series, TV, films, games, gaming, culture, theater, etc.
 */

export interface Article {
  title: string;
  content?: string;
  body_text?: string;
  category?: string;
  source?: string;
  url?: string;
  date?: string;
  published_at?: string;
  [key: string]: any;
}

// Apropos Magazine focus areas - Comprehensive keywords in Danish and English
// Broad coverage for reviews, concerts, festivals, TV, film, gaming, culture, and theater
const APROPOS_KEYWORDS = {
  // Music & Concerts - Koncert anmeldelser
  concerts: [
    // Danish
    'koncert', 'koncertanmeldelse', 'koncert anmeldelse', 'live koncert', 'live show', 
    'live anmeldelse', 'live anmelder', 'musik', 'musiker', 'band', 'artister', 'artist',
    'optræden', 'performance', 'scene', 'venue', 'spillested', 'koncertsal',
    'festival', 'festivalanmeldelse', 'festival anmeldelse', 'festival anmelder',
    'roskilde', 'northside', 'spot festival', 'copenhagen jazz', 'tønder festival',
    'anmeldelse koncert', 'anmeldelse live', 'kritik koncert', 'bedømmelse koncert',
    // English
    'concert', 'concert review', 'live concert', 'live show', 'live performance', 
    'music', 'musician', 'band', 'artist', 'artists', 'gig', 'performance', 'venue',
    'festival', 'festival review', 'festival coverage', 'music festival',
    'concert review', 'live review', 'show review', 'gig review', 'performance review',
    'music review', 'album review', 'single review', 'ep review',
    // Platform/venue names
    'vega', 'pumpehuset', 'amager bio', 'tivoli', 'royal arena', 'forum', 'parken',
    'woodstock', 'coachella', 'glastonbury', 'reading', 'leeds', 'sxsw'
  ],
  
  // TV & Series - TV serier anmeldelser + TV anmeldelser
  tvSeries: [
    // Danish
    'serie', 'serieanmeldelse', 'serie anmeldelse', 'tv-serie', 'tv serie', 'tv serie anmeldelse',
    'tv', 'tv anmeldelse', 'tv anmelder', 'tv anmeldelser', 'tv-kritik', 'tv kritik',
    'streaming', 'streaming anmeldelse', 'streaming tjeneste',
    'anmeldelse serie', 'anmeldelse tv', 'bedømmelse serie', 'kritik serie',
    'dramaserie', 'komedieserie', 'thriller serie', 'krimi serie', 'sci-fi serie',
    // English
    'series', 'series review', 'tv series', 'tv series review', 'tv show', 'tv show review',
    'television', 'television review', 'tv review', 'show review',
    'streaming', 'streaming review', 'streaming service', 'streaming platform',
    'drama series', 'comedy series', 'thriller series', 'crime series', 'sci-fi series',
    'limited series', 'mini series', 'anthology series', 'docuseries', 'documentary series',
    // Platform names
    'netflix', 'hbo', 'hbo max', 'disney+', 'disney plus', 'amazon prime', 'prime video',
    'viaplay', 'tv3', 'dr', 'tv2', 'apple tv+', 'paramount+', 'paramount plus',
    'showtime', 'starz', 'hulu', 'peacock', 'max', 'crave', 'stan'
  ],
  
  // Film - Film anmeldelser
  films: [
    // Danish
    'film', 'filmanmeldelse', 'film anmeldelse', 'film anmelder', 'film anmeldelser',
    'cinema', 'biograf', 'biografanmeldelse', 'biograf anmeldelse',
    'anmeldelse film', 'anmeldelse movie', 'filmkritik', 'movie kritik', 'film kritik',
    'spillefilm', 'dokumentar', 'kortfilm', 'animationsfilm', 'actionfilm', 'komediefilm',
    'dramafilm', 'thriller', 'krimi film', 'horror film', 'sci-fi film', 'romantisk film',
    'premiere', 'filmpremiere', 'festivalfilm', 'festival film',
    // English
    'film', 'film review', 'movie', 'movie review', 'cinema', 'cinema review', 
    'movie review', 'film review', 'film critic', 'movie critic',
    'feature film', 'documentary', 'documentary review', 'short film', 'animation', 'animated film',
    'action film', 'comedy', 'comedy film', 'drama', 'drama film', 'thriller', 'thriller film',
    'crime film', 'horror', 'horror film', 'sci-fi', 'sci-fi film', 'science fiction',
    'romance', 'romantic film', 'rom-com', 'romantic comedy',
    'premiere', 'film premiere', 'festival film', 'film festival',
    // Film festivals and awards
    'cannes', 'venice film festival', 'sundance', 'tribeca', 'berlin film festival',
    'oscar', 'oscars', 'golden globe', 'bafta', 'cannes film festival',
    'filmfestival', 'film festival', 'filmfestivalen'
  ],
  
  // Gaming - Spil/Gaming anmeldelser
  games: [
    // Danish
    'spil', 'spilanmeldelse', 'spil anmeldelse', 'spil anmelder', 'spil anmeldelser',
    'gaming', 'gaming anmeldelse', 'gaming anmelder', 'videospil', 'videospil anmeldelse',
    'anmeldelse spil', 'anmeldelse game', 'spilkritik', 'game kritik', 'bedømmelse spil',
    'pc spil', 'konsol spil', 'mobil spil', 'indie spil', 'triple-a spil', 'aaa spil',
    'action spil', 'adventure spil', 'rpg', 'strategi spil', 'simulation spil', 'racing spil',
    // English
    'game', 'game review', 'gaming', 'gaming review', 'video game', 'video game review',
    'game review', 'gaming review', 'game critic', 'gaming critic',
    'pc game', 'console game', 'mobile game', 'indie game', 'triple-a', 'triple a', 'aaa game',
    'action game', 'adventure game', 'rpg', 'role-playing game', 'strategy game', 
    'simulation game', 'racing game', 'sports game', 'fighting game', 'puzzle game',
    // Platform names
    'playstation', 'ps5', 'ps4', 'xbox', 'xbox series x', 'xbox series s', 'xbox one',
    'nintendo', 'switch', 'nintendo switch', 'wii', 'wii u', 'game boy', '3ds',
    'pc', 'steam', 'epic games', 'epic games store', 'origin', 'uplay', 'gog',
    'mobile gaming', 'ios game', 'android game', 'app store', 'google play'
  ],
  
  // Culture & Theater - Kultur/Teater anmeldelser
  culture: [
    // Danish
    'kultur', 'kulturanmeldelse', 'kultur anmeldelse', 'kultur anmelder', 'kultur anmeldelser',
    'teater', 'teateranmeldelse', 'teater anmeldelse', 'teater anmelder', 'teater anmeldelser',
    'teaterkritik', 'teater kritik', 'scenekunst', 'scenekunst anmeldelse',
    'anmeldelse teater', 'anmeldelse kultur', 'kultur kritik', 'bedømmelse teater',
    'forestilling', 'opsætning', 'stykke', 'komedie', 'drama teater', 'musical',
    'opera', 'opera anmeldelse', 'ballet', 'ballet anmeldelse', 'dans', 'dans anmeldelse',
    'kunst', 'kunstanmeldelse', 'kunst anmeldelse', 'udstilling', 'udstillingsanmeldelse',
    'galleri', 'museum', 'kunstmuseum', 'billedkunst', 'skulptur', 'fotografi',
    'bog', 'boganmeldelse', 'bog anmeldelse', 'litteratur', 'litteratur anmeldelse',
    'poesi', 'poesi anmeldelse', 'lyrik', 'roman', 'roman anmeldelse',
    // English
    'culture', 'cultural review', 'culture review', 'cultural critic',
    'theater', 'theatre', 'theater review', 'theatre review', 'theater critic', 'theatre critic',
    'stage', 'stage review', 'stage production', 'theater production', 'theatre production',
    'play', 'play review', 'show', 'show review', 'performance', 'performance review',
    'comedy', 'drama', 'musical', 'musical review',
    'opera', 'opera review', 'ballet', 'ballet review', 'dance', 'dance review',
    'art', 'art review', 'art critic', 'exhibition', 'exhibition review', 'gallery', 'gallery review',
    'museum', 'art museum', 'visual art', 'sculpture', 'photography', 'photography review',
    'book', 'book review', 'literature', 'literary review', 'poetry', 'poetry review',
    'poem', 'novel', 'novel review', 'fiction', 'non-fiction',
    // Venues and institutions
    'royal danish theatre', 'det kongelige teater', 'skuespilhuset', 'operaen',
    'national gallery', 'statens museum', 'ny carlsberg glyptotek', 'louisiana',
    'arken', 'kunsten', 'kunsthal', 'kunstmuseum'
  ]
};

// Combined keywords for all Apropos topics
const ALL_APROPOS_KEYWORDS = Object.values(APROPOS_KEYWORDS).flat();

/**
 * Calculate relevance score for an article based on Apropos Magazine's focus areas
 */
export function calculateRelevanceScore(article: Article): number {
  let score = 0;
  
  const title = (article.title || '').toLowerCase();
  const content = ((article.body_text || article.content || '').toString()).toLowerCase();
  const combined = title + ' ' + content;
  const category = (article.category || '').toLowerCase();
  
  // Check for review/critique keywords (higher priority for Apropos)
  const isReview = 
    title.includes('anmeldelse') || 
    title.includes('review') || 
    title.includes('bedømmelse') || 
    title.includes('kritik') ||
    title.includes('anmelder') ||
    content.includes('anmeldelse') ||
    content.includes('review');
  
  if (isReview) {
    score += 50; // High bonus for reviews
  }
  
  // Check for Apropos keywords in title (higher weight)
  let titleMatches = 0;
  for (const keyword of ALL_APROPOS_KEYWORDS) {
    if (title.includes(keyword.toLowerCase())) {
      titleMatches++;
      score += 15; // Higher weight for title matches
    }
  }
  
  // Check for Apropos keywords in content
  let contentMatches = 0;
  for (const keyword of ALL_APROPOS_KEYWORDS) {
    if (content.includes(keyword.toLowerCase())) {
      contentMatches++;
      score += 5; // Lower weight for content matches
    }
  }
  
  // Category-based scoring
  if (category) {
    const categoryKeywords = [
      'koncert', 'concert', 'musik', 'music', 'film', 'movie', 'serie', 'series',
      'tv', 'gaming', 'gaming', 'spil', 'game', 'kultur', 'culture', 'teater', 'theater'
    ];
    
    for (const keyword of categoryKeywords) {
      if (category.includes(keyword)) {
        score += 20;
        break;
      }
    }
  }
  
  // Specific topic detection with higher scores
  const topicMatches = {
    concerts: APROPOS_KEYWORDS.concerts.filter(kw => combined.includes(kw.toLowerCase())).length,
    tvSeries: APROPOS_KEYWORDS.tvSeries.filter(kw => combined.includes(kw.toLowerCase())).length,
    films: APROPOS_KEYWORDS.films.filter(kw => combined.includes(kw.toLowerCase())).length,
    games: APROPOS_KEYWORDS.games.filter(kw => combined.includes(kw.toLowerCase())).length,
    culture: APROPOS_KEYWORDS.culture.filter(kw => combined.includes(kw.toLowerCase())).length,
  };
  
  // Bonus for multiple topic matches
  const totalTopicMatches = Object.values(topicMatches).reduce((sum, count) => sum + count, 0);
  if (totalTopicMatches > 0) {
    score += totalTopicMatches * 10;
  }
  
  // Recency bonus (more recent = higher score) - give base score for recent articles even without keywords
  const date = article.published_at || article.date;
  if (date) {
    try {
      const publishedDate = new Date(date);
      const daysSincePublished = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSincePublished === 0) score += 40; // Very high bonus for today
      else if (daysSincePublished === 1) score += 35;
      else if (daysSincePublished <= 3) score += 30;
      else if (daysSincePublished <= 7) score += 25;
      else if (daysSincePublished <= 14) score += 20; // Base score for recent articles
      else if (daysSincePublished <= 30) score += 10;
    } catch {}
  } else {
    // Articles without dates get a base score (assume recent from ingestion)
    score += 15;
  }
  
  // Content quality bonus
  if (content.length > 500) {
    score += 10; // Longer content often more detailed
  }
  
  // Source diversity (prefer non-Apropos sources for inspiration)
  if (article.source && !article.source.toLowerCase().includes('apropos')) {
    score += 5;
  }
  
  // Penalize Berlingske and BT articles that don't match Apropos topics
  // These are general news sources - only show relevant articles
  const sourceLower = (article.source || '').toLowerCase();
  if (sourceLower.includes('berlingske') || sourceLower.includes('bt')) {
    // Only show if it's clearly a review or matches Apropos topics
    if (!isReview && totalTopicMatches === 0) {
      score -= 30; // Heavy penalty for non-relevant articles from general news sources
    }
    // Extra bonus for reviews from these sources (they're rare but valuable)
    if (isReview) {
      score += 30; // Extra bonus for reviews from Berlingske/BT
    }
  }
  
  // Base score for any article - ensure we show something even if not highly relevant
  // This prevents empty results when there are few perfect matches
  // BUT: Don't give base score to Berlingske/BT articles that don't match topics
  if (score === 0) {
    if (sourceLower.includes('berlingske') || sourceLower.includes('bt')) {
      // Don't give base score to irrelevant general news articles
      return 0;
    }
    score = 5; // Minimum base score for other sources
  }
  
  return score;
}

/**
 * Filter articles by relevance to Apropos Magazine's focus areas
 */
export function filterRelevantArticles(articles: Article[], minScore: number = 30): Article[] {
  return articles
    .map(article => ({
      ...article,
      relevanceScore: calculateRelevanceScore(article)
    }))
    .filter(article => article.relevanceScore >= minScore)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}

/**
 * Detect article type based on content
 */
export function detectArticleType(article: Article): 'concert' | 'tv-series' | 'film' | 'game' | 'culture' | 'other' {
  const title = (article.title || '').toLowerCase();
  const content = ((article.body_text || article.content || '').toString()).toLowerCase();
  const combined = title + ' ' + content;
  
  // Check for concert keywords
  const concertMatches = APROPOS_KEYWORDS.concerts.filter(kw => combined.includes(kw.toLowerCase())).length;
  if (concertMatches > 0) return 'concert';
  
  // Check for TV series keywords
  const tvMatches = APROPOS_KEYWORDS.tvSeries.filter(kw => combined.includes(kw.toLowerCase())).length;
  if (tvMatches > 0) return 'tv-series';
  
  // Check for film keywords
  const filmMatches = APROPOS_KEYWORDS.films.filter(kw => combined.includes(kw.toLowerCase())).length;
  if (filmMatches > 0) return 'film';
  
  // Check for game keywords
  const gameMatches = APROPOS_KEYWORDS.games.filter(kw => combined.includes(kw.toLowerCase())).length;
  if (gameMatches > 0) return 'game';
  
  // Check for culture keywords
  const cultureMatches = APROPOS_KEYWORDS.culture.filter(kw => combined.includes(kw.toLowerCase())).length;
  if (cultureMatches > 0) return 'culture';
  
  return 'other';
}

