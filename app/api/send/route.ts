import { NextResponse } from 'next/server';

// AI Processing Functions
async function generateSmartPrompt(article: any): Promise<string> {
  const { title, summary, bullets, source, category } = article;
  
  // Analyze content to generate intelligent prompts
  const contentAnalysis = analyzeContent(title, summary, bullets);
  const trendContext = detectTrends(article);
  
  return `Skriv en dybdegående artikel baseret på "${title}" fra ${source?.toUpperCase()}.

**Original indhold:**
${summary}

**Nøglepunkter:**
${bullets?.slice(0, 5).map((b: string) => `• ${b}`).join('\n') || 'Ingen nøglepunkter'}

**AI Analyse:**
- Kategori: ${category || 'Generel'}
- Trend: ${trendContext.trend}
- Vinkel: ${trendContext.angle}
- Målgruppe: ${trendContext.audience}

**Instruktioner:**
1. Uddyb de vigtigste pointer med eksperter og statistikker
2. Tilføj kontekst og baggrundsinformation
3. Inkluder relevante eksempler og sammenligninger
4. Skriv i en engagerende, journalistisk stil
5. Mål for 800-1200 ord
6. Inkluder call-to-action til læseren

**Fokusområder:**
${contentAnalysis.focusAreas.join(', ')}

Generer en komplet, publiceringsklar artikel.`;
}

function analyzeContent(title: string, summary: string, bullets: string[]): any {
  const text = `${title} ${summary} ${bullets?.join(' ') || ''}`.toLowerCase();
  
  // Simple content analysis
  const focusAreas = [];
  
  if (text.includes('musik') || text.includes('album') || text.includes('koncert')) {
    focusAreas.push('Musikindustri', 'Kunstnerisk udvikling', 'Publikumsreaktioner');
  }
  if (text.includes('film') || text.includes('serie') || text.includes('skuespiller')) {
    focusAreas.push('Filmindustri', 'Kritik', 'Kulturpåvirkning');
  }
  if (text.includes('politik') || text.includes('regering') || text.includes('valg')) {
    focusAreas.push('Politisk analyse', 'Samfundspåvirkning', 'Fremtidige konsekvenser');
  }
  if (text.includes('teknologi') || text.includes('ai') || text.includes('digital')) {
    focusAreas.push('Teknologisk udvikling', 'Samfundspåvirkning', 'Fremtidige muligheder');
  }
  if (text.includes('sport') || text.includes('fodbold') || text.includes('kamp')) {
    focusAreas.push('Sportsanalyse', 'Præstationer', 'Fans og kultur');
  }
  
  return {
    focusAreas: focusAreas.length > 0 ? focusAreas : ['Generel analyse', 'Samfundspåvirkning', 'Fremtidige udviklinger']
  };
}

function detectTrends(article: any): any {
  const { title, summary, source, category } = article;
  const text = `${title} ${summary}`.toLowerCase();
  
  // Trend detection logic
  let trend = 'Stabil';
  let angle = 'Balanceret analyse';
  let audience = 'Generel læser';
  
  if (text.includes('ny') || text.includes('første') || text.includes('breakthrough')) {
    trend = 'Voksende';
    angle = 'Innovation og fremtid';
    audience = 'Early adopters';
  }
  
  if (text.includes('krise') || text.includes('problem') || text.includes('udfordring')) {
    trend = 'Faldende';
    angle = 'Kritisk analyse';
    audience = 'Beslutningstagere';
  }
  
  if (text.includes('succes') || text.includes('rekord') || text.includes('vind')) {
    trend = 'Stigende';
    angle = 'Succeshistorie';
    audience = 'Inspirerede læsere';
  }
  
  return { trend, angle, audience };
}

async function processWithAI(articles: any[]): Promise<any[]> {
  const processedArticles = [];
  
  for (const article of articles) {
    try {
      // Generate smart prompt
      const prompt = await generateSmartPrompt(article);
      
      // Simulate AI processing (in real implementation, call OpenAI/Claude/etc.)
      const aiResponse = await simulateAIResponse(article, prompt);
      
      processedArticles.push({
        id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: `AI Draft: ${aiResponse.title}`,
        originalTitle: article.title,
        source: article.source?.toUpperCase() || 'MEDIE',
        status: 'completed',
        createdAt: new Date().toISOString(),
        summary: aiResponse.summary,
        suggestions: aiResponse.suggestions,
        prompt: prompt,
        notes: aiResponse.notes,
        isEditing: false,
        aiGenerated: true,
        contentAnalysis: analyzeContent(article.title, article.summary, article.bullets),
        trendData: detectTrends(article)
      });
    } catch (error) {
      console.error('Error processing article with AI:', error);
    }
  }
  
  return processedArticles;
}

async function simulateAIResponse(article: any, prompt: string): Promise<any> {
  // Simulate AI response (replace with real AI API call)
  const { title, summary, bullets, source, category } = article;
  
  return {
    title: `Dybdgående analyse: ${title}`,
    summary: `AI-genereret artikel baseret på "${title}" fra ${source?.toUpperCase()}. Denne artikel uddyber de vigtigste pointer fra originalen og tilføjer kontekst, eksperter og statistikker for at skabe en komplet, publiceringsklar artikel.`,
    suggestions: [
      'Tilføj ekspertcitater fra relevante fagfolk',
      'Inkluder statistikker og data for at understøtte argumenter',
      'Uddyb baggrundshistorien for bedre kontekst',
      'Tilføj sammenligninger med lignende cases',
      'Inkluder læserens perspektiv og relevans'
    ],
    notes: `Automatisk genereret af Apropos Editorial AI. Kategori: ${category || 'Generel'}. Kilde: ${source?.toUpperCase() || 'MEDIE'}. Anbefales at gennemgå og justere før publicering.`
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const articles = body?.items || [];
    
    if (!Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ error: 'No articles provided' }, { status: 400 });
    }
    
    // Process articles with AI
    const processedArticles = await processWithAI(articles);
    
    // In a real implementation, you would:
    // 1. Save to database
    // 2. Send to AI service (OpenAI, Claude, etc.)
    // 3. Store results
    // 4. Send notifications
    
    return NextResponse.json({ 
      ok: true, 
      processed: processedArticles.length,
      articles: processedArticles,
      message: `${processedArticles.length} artikler er blevet behandlet af Apropos Editorial AI`
    });
    
  } catch (error) {
    console.error('Error in AI processing:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
