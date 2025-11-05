import { NextRequest, NextResponse } from 'next/server';
import { 
  performComprehensiveResearch, 
  verifyContent, 
  formatResearchForPrompt,
  type ResearchSources,
  type VerificationResult 
} from '@/lib/research-verification-service';

/**
 * Comprehensive Test Endpoint for Research & Verification System
 * Tests all components: Wikipedia, TMDB, IMDb, Web Search, Verification, Plagiarism
 */
export async function POST(request: NextRequest) {
  const testResults: any = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    }
  };

  try {
    const { topic, title, articleData } = await request.json();
    
    const testTopic = topic || 'Highest to Lowest';
    const testTitle = title || testTopic;
    const testArticleData = articleData || {
      title: testTitle,
      category: 'Serier & Film',
      topic: 'TV-serier',
      platform: 'Apple TV'
    };

    const baseUrl = request.url.split('/api')[0];

    // TEST 1: Comprehensive Research
    console.log('\n🧪 TEST 1: Comprehensive Research');
    testResults.tests.push({
      name: 'Comprehensive Research',
      status: 'running'
    });

    const researchStartTime = Date.now();
    const researchSources = await performComprehensiveResearch(
      testTopic,
      testArticleData,
      baseUrl
    );
    const researchTime = Date.now() - researchStartTime;

    // Verify research results
    const researchTest = {
      name: 'Comprehensive Research',
      status: 'passed',
      duration: `${researchTime}ms`,
      details: {
        webSearchResults: researchSources.webSearch.length,
        hasWikipedia: !!researchSources.wikipedia,
        hasTMDB: !!researchSources.tmdbVerification,
        hasIMDb: !!researchSources.imdb,
        hasAdvancedResearch: !!researchSources.advancedResearch,
        wikipediaLanguage: researchSources.wikipedia?.language,
        tmdbVerified: researchSources.tmdbVerification?.verified,
        tmdbType: researchSources.tmdbVerification?.type,
        imdbTitle: researchSources.imdb?.title,
        imdbRating: researchSources.imdb?.rating
      },
      issues: [] as string[],
      warnings: [] as string[]
    };

    // Check for issues
    if (researchSources.webSearch.length === 0) {
      researchTest.issues.push('No web search results');
      researchTest.status = 'failed';
    }
    if (!researchSources.wikipedia && testArticleData.category?.includes('Film')) {
      researchTest.warnings.push('Wikipedia not found (expected for media reviews)');
    }
    if (testArticleData.category?.includes('Film') && !researchSources.tmdbVerification) {
      researchTest.warnings.push('TMDB verification missing for media review');
    }

    testResults.tests[0] = researchTest;
    if (researchTest.status === 'passed') testResults.summary.passed++;
    else testResults.summary.failed++;
    if (researchTest.warnings.length > 0) testResults.summary.warnings++;

    // TEST 2: Wikipedia Search
    console.log('\n🧪 TEST 2: Wikipedia Search');
    testResults.tests.push({
      name: 'Wikipedia Search',
      status: 'running'
    });

    const wikiTest = {
      name: 'Wikipedia Search',
      status: 'passed',
      details: {
        found: !!researchSources.wikipedia,
        title: researchSources.wikipedia?.title,
        language: researchSources.wikipedia?.language,
        contentLength: researchSources.wikipedia?.content?.length || 0,
        url: researchSources.wikipedia?.url
      },
      issues: [] as string[],
      warnings: [] as string[]
    };

    if (!researchSources.wikipedia) {
      wikiTest.warnings.push('Wikipedia not found - may be normal for some topics');
    } else {
      if (researchSources.wikipedia.content.length < 100) {
        wikiTest.warnings.push('Wikipedia content seems short');
      }
      if (!researchSources.wikipedia.url) {
        wikiTest.issues.push('Wikipedia URL missing');
        wikiTest.status = 'failed';
      }
    }

    testResults.tests[1] = wikiTest;
    if (wikiTest.status === 'passed') testResults.summary.passed++;
    else testResults.summary.failed++;
    if (wikiTest.warnings.length > 0) testResults.summary.warnings++;

    // TEST 3: TMDB Verification
    console.log('\n🧪 TEST 3: TMDB Verification');
    testResults.tests.push({
      name: 'TMDB Verification',
      status: 'running'
    });

    const tmdbTest = {
      name: 'TMDB Verification',
      status: 'passed',
      details: {
        found: !!researchSources.tmdbVerification,
        verified: researchSources.tmdbVerification?.verified,
        type: researchSources.tmdbVerification?.type,
        title: researchSources.tmdbVerification?.title,
        id: researchSources.tmdbVerification?.id,
        releaseDate: researchSources.tmdbVerification?.releaseDate || researchSources.tmdbVerification?.firstAirDate
      },
      issues: [] as string[],
      warnings: [] as string[]
    };

    if (!researchSources.tmdbVerification && testArticleData.category?.includes('Film')) {
      tmdbTest.warnings.push('TMDB verification not found - may need TMDB_API_KEY');
    } else if (researchSources.tmdbVerification && !researchSources.tmdbVerification.verified) {
      tmdbTest.warnings.push('TMDB found but not verified');
    }

    testResults.tests[2] = tmdbTest;
    if (tmdbTest.status === 'passed') testResults.summary.passed++;
    if (tmdbTest.warnings.length > 0) testResults.summary.warnings++;

    // TEST 4: IMDb Search
    console.log('\n🧪 TEST 4: IMDb Search');
    testResults.tests.push({
      name: 'IMDb Search',
      status: 'running'
    });

    const imdbTest = {
      name: 'IMDb Search',
      status: 'passed',
      details: {
        found: !!researchSources.imdb,
        title: researchSources.imdb?.title,
        type: researchSources.imdb?.type,
        year: researchSources.imdb?.year,
        rating: researchSources.imdb?.rating,
        plot: researchSources.imdb?.plot ? researchSources.imdb.plot.substring(0, 100) + '...' : null,
        url: researchSources.imdb?.url
      },
      issues: [] as string[],
      warnings: [] as string[]
    };

    if (!researchSources.imdb && testArticleData.category?.includes('Film')) {
      imdbTest.warnings.push('IMDb not found - may need OMDB_API_KEY');
    }

    testResults.tests[3] = imdbTest;
    if (imdbTest.status === 'passed') testResults.summary.passed++;
    if (imdbTest.warnings.length > 0) testResults.summary.warnings++;

    // TEST 5: Format Research for Prompt
    console.log('\n🧪 TEST 5: Format Research for Prompt');
    testResults.tests.push({
      name: 'Format Research for Prompt',
      status: 'running'
    });

    const formatStartTime = Date.now();
    const formattedPrompt = formatResearchForPrompt(researchSources);
    const formatTime = Date.now() - formatStartTime;

    const formatTest = {
      name: 'Format Research for Prompt',
      status: 'passed',
      duration: `${formatTime}ms`,
      details: {
        promptLength: formattedPrompt.length,
        hasWikipedia: formattedPrompt.includes('WIKIPEDIA'),
        hasTMDB: formattedPrompt.includes('TMDB'),
        hasIMDb: formattedPrompt.includes('IMDb'),
        hasWebSearch: formattedPrompt.includes('FAKTUEL RESEARCH'),
        hasCriticalInstructions: formattedPrompt.includes('KRITISK')
      },
      issues: [] as string[],
      warnings: [] as string[]
    };

    if (formattedPrompt.length < 100) {
      formatTest.issues.push('Formatted prompt seems too short');
      formatTest.status = 'failed';
    }
    if (!formattedPrompt.includes('KRITISK')) {
      formatTest.warnings.push('Missing critical instructions');
    }

    testResults.tests[4] = formatTest;
    if (formatTest.status === 'passed') testResults.summary.passed++;
    else testResults.summary.failed++;
    if (formatTest.warnings.length > 0) testResults.summary.warnings++;

    // TEST 6: Content Verification (with sample content)
    console.log('\n🧪 TEST 6: Content Verification');
    testResults.tests.push({
      name: 'Content Verification',
      status: 'running'
    });

    const sampleContent = `Intro: Jeg har lige set "${testTitle}" og må sige at det er en interessant ${researchSources.tmdbVerification?.type === 'film' ? 'film' : 'serie'}. 

${researchSources.wikipedia?.content?.substring(0, 200) || 'Indholdet er spændende og velproduceret.'}

Jeg kan anbefale at se dette værk.`;

    const verificationStartTime = Date.now();
    const verificationResult = await verifyContent(
      sampleContent,
      researchSources,
      'Original notes about the content'
    );
    const verificationTime = Date.now() - verificationStartTime;

    const verificationTest = {
      name: 'Content Verification',
      status: verificationResult.passed ? 'passed' : 'failed',
      duration: `${verificationTime}ms`,
      details: {
        passed: verificationResult.passed,
        plagiarismScore: verificationResult.plagiarismScore,
        factualityScore: verificationResult.factualityScore,
        mediaTypeCorrect: verificationResult.mediaTypeCorrect,
        issuesCount: verificationResult.issues.length,
        warningsCount: verificationResult.warnings.length,
        citationsCount: verificationResult.citations.length,
        issues: verificationResult.issues,
        warnings: verificationResult.warnings
      },
      issues: [] as string[],
      warnings: [] as string[]
    };

    // Only add warnings, don't fail the test
    if (verificationResult.plagiarismScore > 0.4) {
      verificationTest.warnings.push(`High plagiarism score: ${verificationResult.plagiarismScore}`);
    }
    if (verificationResult.factualityScore < 0.7) {
      verificationTest.warnings.push(`Low factuality score: ${verificationResult.factualityScore}`);
    }
    if (!verificationResult.mediaTypeCorrect && researchSources.tmdbVerification?.verified) {
      verificationTest.warnings.push('Media type incorrect in content');
    }
    
    // Test is passed if verification passed OR if there are only warnings (not critical issues)
    if (!verificationResult.passed && verificationResult.issues.length > 0) {
      verificationTest.status = 'failed';
    }

    testResults.tests[5] = verificationTest;
    if (verificationTest.status === 'passed') testResults.summary.passed++;
    else testResults.summary.failed++;
    if (verificationTest.warnings.length > 0) testResults.summary.warnings++;

    // TEST 7: Environment Variables Check
    console.log('\n🧪 TEST 7: Environment Variables');
    testResults.tests.push({
      name: 'Environment Variables',
      status: 'running'
    });

    const envTest = {
      name: 'Environment Variables',
      status: 'passed',
      details: {
        hasOpenAIApiKey: !!process.env.OPENAI_API_KEY,
        hasTMDBApiKey: !!process.env.TMDB_API_KEY,
        hasOMDBApiKey: !!process.env.OMDB_API_KEY,
        openAIModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        researchModel: process.env.OPENAI_RESEARCH_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
      },
      issues: [] as string[],
      warnings: [] as string[]
    };

    if (!process.env.OPENAI_API_KEY) {
      envTest.issues.push('OPENAI_API_KEY missing');
      envTest.status = 'failed';
    }
    if (!process.env.TMDB_API_KEY) {
      envTest.warnings.push('TMDB_API_KEY missing - TMDB verification will not work');
    }
    if (!process.env.OMDB_API_KEY) {
      envTest.warnings.push('OMDB_API_KEY missing - IMDb search will not work');
    }

    testResults.tests[6] = envTest;
    if (envTest.status === 'passed') testResults.summary.passed++;
    else testResults.summary.failed++;
    if (envTest.warnings.length > 0) testResults.summary.warnings++;

    // Update summary
    testResults.summary.total = testResults.tests.length;

    // Overall status
    testResults.overallStatus = testResults.summary.failed === 0 ? 'passed' : 'failed';
    testResults.totalDuration = `${Date.now() - researchStartTime}ms`;

    return NextResponse.json({
      success: true,
      testResults,
      researchSources: {
        webSearch: researchSources.webSearch.length,
        wikipedia: !!researchSources.wikipedia,
        tmdb: !!researchSources.tmdbVerification,
        imdb: !!researchSources.imdb,
        advancedResearch: !!researchSources.advancedResearch
      },
      formattedPromptPreview: formattedPrompt.substring(0, 500) + '...'
    });

  } catch (error) {
    console.error('Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      testResults
    }, { status: 500 });
  }
}

