export type SimpleArticle = {
  title: string;
  category?: string;
  tags?: string[];
  source?: string;
  date?: string;
  content?: string;
  url?: string;
  keyPoints?: string[];
};

export function isStopWord(word: string): boolean {
  const stopWords = [
    'og','eller','men','for','med','på','til','af','i','det','den','der','som','at','en','et',
    'har','kan','vil','skal','må','bør','kunne','ville','skulle','måtte','burde',
    'the','and','or','but','for','with','on','to','of','in','that','which','as','a','an',
    'have','can','will','shall','may','should','could','would','might'
  ];
  return stopWords.includes(word.toLowerCase());
}

export function inferCategoryFrom(input: string): string {
  const s = (input || '').toLowerCase();
  if (s.includes('/musik') || s.includes('music') || s.includes('koncert')) return 'Musik';
  if (s.includes('/film') || s.includes('movie') || s.includes('cinema')) return 'Film';
  if (s.includes('serie') || s.includes('/tv') || s.includes('netflix') || s.includes('hbo') || s.includes('disney')) return 'Serier & Film';
  if (s.includes('gaming') || s.includes('playstation') || s.includes('xbox') || s.includes('nintendo')) return 'Gaming';
  if (s.includes('tech') || s.includes('teknologi') || s.includes('ai')) return 'Tech';
  if (s.includes('kultur')) return 'Kultur';
  return '';
}

export function extractKeyPoints(text: string, title?: string, lead?: string): string[] {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const bullets = t.split(/•|\u2022|\n-\s|\n\*\s/).map(s=>s.trim());
  const raw = (bullets.filter(Boolean).length > 1 ? bullets : t.split(/(?<=[\.!\?])\s+/)).map(s=>s.trim());
  const filtered = raw
    .filter(Boolean)
    .filter(s => /[A-Za-zÆØÅæøå]/.test(s))
    .filter(s => !/^\d{1,2}\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\.?/i.test(s))
    .filter(s => !/\b(Af\s+\w|FOTO:|Læsetid|@)\b/i.test(s))
    .filter(s => s.replace(/[^A-Za-zÆØÅæøå0-9]/g,'').length >= 25)
    .map(s => s.length > 200 ? s.slice(0, 197) + '…' : s);
  const unique: string[] = [];
  for (const s of filtered) {
    const key = s.slice(0, 50).toLowerCase();
    const normTitle = (title||'').toLowerCase().trim();
    const normLead = (lead||'').toLowerCase().trim();
    const isDupOfTitle = normTitle && (normTitle.startsWith(key) || key.startsWith(normTitle.slice(0,50)) || s.toLowerCase().includes(normTitle.slice(0,60)));
    const isDupOfLead = normLead && (normLead.startsWith(key) || key.startsWith(normLead.slice(0,50)) || s.toLowerCase().includes(normLead.slice(0,80)));
    if (isDupOfTitle || isDupOfLead) continue;
    if (!unique.some(u => u.slice(0, 50).toLowerCase() === key)) unique.push(s);
    if (unique.length >= 3) break;
  }
  return unique;
}

export function analyzeTrends(articles: SimpleArticle[]) {
  const categoryCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  const titleWords: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};

  articles.forEach(article => {
    if (article.category) {
      categoryCounts[article.category] = (categoryCounts[article.category] || 0) + 1;
    }
    if (Array.isArray(article.tags)) {
      article.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
    const words = (article.title || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !isStopWord(w));
    words.forEach(w => { titleWords[w] = (titleWords[w] || 0) + 1; });

    const title = (article.title || '').toLowerCase();
    if (/(game|gaming|xbox|playstation|nintendo)/.test(title)) topicCounts['Gaming'] = (topicCounts['Gaming'] || 0) + 1;
    if (/(tech|ai|microsoft|apple|google)/.test(title)) topicCounts['Tech'] = (topicCounts['Tech'] || 0) + 1;
    if (/(film|movie|serie|tv|netflix)/.test(title)) topicCounts['Entertainment'] = (topicCounts['Entertainment'] || 0) + 1;
    if (/(music|concert|album|artist)/.test(title)) topicCounts['Music'] = (topicCounts['Music'] || 0) + 1;
    if (/(news|breaking|update|latest)/.test(title)) topicCounts['News'] = (topicCounts['News'] || 0) + 1;
  });

  const topCategories = Object.entries(categoryCounts).sort(([,a],[,b]) => b-a).slice(0,5).map(([category,count])=>({category,count}));
  const topTags = Object.entries(tagCounts).sort(([,a],[,b]) => b-a).slice(0,10).map(([tag,count])=>({tag,count}));
  const topWords = Object.entries(titleWords).sort(([,a],[,b]) => b-a).slice(0,15).map(([word,count])=>({word,count}));
  const topTopics = Object.entries(topicCounts).sort(([,a],[,b]) => b-a).slice(0,5).map(([topic,count])=>({topic,count}));

  return { topCategories, topTags, topWords, topTopics, totalArticles: articles.length };
}

export function getArticlesForTopic(articles: SimpleArticle[], topic: string): SimpleArticle[] {
  const topicKeywords: Record<string, string[]> = {
    'Gaming': ['game','gaming','xbox','playstation','nintendo','pc','console'],
    'Tech': ['tech','ai','microsoft','apple','google','smartphone','computer'],
    'Entertainment': ['film','movie','serie','tv','netflix','streaming','cinema'],
    'Music': ['music','concert','album','artist','song','band','festival'],
    'News': ['news','breaking','update','latest','report','story']
  };
  const keywords = topicKeywords[topic] || [];
  return articles.filter(a => {
    const title = (a.title || '').toLowerCase();
    return keywords.some(k => title.includes(k));
  }).slice(0,8);
}

export function getArticlesForCategory(articles: SimpleArticle[], category: string): SimpleArticle[] {
  return articles.filter(a => a.category && a.category.toLowerCase() === category.toLowerCase()).slice(0,8);
}

export function getArticlesForTags(articles: SimpleArticle[], tags: string[]): SimpleArticle[] {
  return articles.filter(a => Array.isArray(a.tags) && a.tags.some(t => tags.some(q => t.toLowerCase().includes(q.toLowerCase())))).slice(0,8);
}

export function generateTrendingTemplates(trends: any, articles: SimpleArticle[]) {
  const templates: any[] = [];
  trends.topTopics.forEach(({ topic, count }: any) => {
    const topicArticles = getArticlesForTopic(articles, topic);
    templates.push({
      id: `trending-${topic.toLowerCase()}`,
      name: `Trending ${topic}`,
      category: topic,
      description: `Baseret på ${count} artikler om ${topic.toLowerCase()}`,
      content: `Skriv en ${topic.toLowerCase()}-artikel baseret på de aktuelle trends.\n\nFokus på:\n- Hvad der trending inden for ${topic.toLowerCase()}\n- Din unikke vinkel på emnet\n- Apropos' karakteristiske tone\n\nInspiration fra ${count} artikler fra andre medier.`,
      tags: [topic, 'Trending', 'Aktuel'],
      trending: true,
      articleCount: count,
      articles: topicArticles
    });
  });

  trends.topCategories.forEach(({ category, count }: any) => {
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    const categoryArticles = getArticlesForCategory(articles, category);
    templates.push({
      id: `trending-cat-${category.toLowerCase()}`,
      name: `Trending ${categoryName}`,
      category: categoryName,
      description: `Baseret på ${count} artikler fra andre medier`,
      content: `Skriv en ${categoryName.toLowerCase()}-artikel baseret på de aktuelle trends.\n\nFokus på:\n- Hvad der trending lige nu\n- Din unikke vinkel på emnet\n- Apropos' karakteristiske tone\n\nInspiration fra ${count} artikler fra andre medier.`,
      tags: [categoryName, 'Trending', 'Anmeldelse'],
      trending: true,
      articleCount: count,
      articles: categoryArticles
    });
  });

  const popularTags = trends.topTags.slice(0, 3);
  if (popularTags.length > 0) {
    const tagNames = popularTags.map(({ tag }: any) => tag).join(', ');
    const totalCount = popularTags.reduce((sum: number, { count }: any) => sum + count, 0);
    const tagArticles = getArticlesForTags(articles, popularTags.map(({ tag }: any) => tag));
    templates.push({
      id: 'trending-tags',
      name: `Trending: ${tagNames}`,
      category: 'Trending',
      description: `Baseret på ${totalCount} artikler med populære tags`,
      content: `Skriv en artikel om de trending emner: ${tagNames}.\n\nFokus på:\n- Hvorfor disse emner er populære lige nu\n- Din analyse af trenden\n- Apropos' unikke perspektiv\n\nBaseret på ${totalCount} artikler fra andre medier.`,
      tags: popularTags.map(({ tag }: any) => tag),
      trending: true,
      articleCount: totalCount,
      articles: tagArticles
    });
  }

  templates.push({
    id: 'trending-general',
    name: 'Trending Nu',
    category: 'Trending',
    description: `Baseret på ${trends.totalArticles} artikler fra alle medier`,
    content: `Skriv om hvad der trending lige nu baseret på andre medier.\n\nFokus på:\n- Hvilke emner der dominerer\n- Din unikke vinkel\n- Apropos' karakteristiske tone\n\nInspireret af ${trends.totalArticles} artikler fra andre medier.`,
    tags: ['Trending', 'Populær', 'Aktuel'],
    trending: true,
    articleCount: trends.totalArticles,
    articles: articles.slice(0,10)
  });

  return templates;
}


