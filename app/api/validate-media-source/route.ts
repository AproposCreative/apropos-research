import { NextRequest, NextResponse } from 'next/server';

// Function to analyze URLs and detect if they are articles or tag/metadata pages
function analyzeUrlTypes(urls: string[]): { articleCount: number; tagCount: number; sampleUrls: string[] } {
  let articleCount = 0;
  let tagCount = 0;
  const sampleUrls = urls.slice(0, 5);
  
  for (const url of urls) {
    const urlLower = url.toLowerCase();
    
    // Check for tag/metadata patterns
    if (urlLower.includes('/tag/') || 
        urlLower.includes('/tags/') ||
        urlLower.includes('/category/') ||
        urlLower.includes('/categories/') ||
        urlLower.includes('/author/') ||
        urlLower.includes('/authors/') ||
        urlLower.includes('/person/') ||
        urlLower.includes('/location/') ||
        urlLower.includes('/organisation/') ||
        urlLower.includes('/metadata/') ||
        urlLower.includes('/taxonomy/')) {
      tagCount++;
    } else {
      // Assume it's an article if it doesn't match tag patterns
      articleCount++;
    }
  }
  
  return { articleCount, tagCount, sampleUrls };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { baseUrl, sitemapIndex } = body;

    if (!baseUrl || !sitemapIndex) {
      return NextResponse.json(
        { error: 'baseUrl and sitemapIndex are required' },
        { status: 400 }
      );
    }

    // Test sitemap accessibility
    const sitemapUrl = new URL(sitemapIndex, baseUrl).toString();
    
    try {
      // Try HEAD request first
      let response = await fetch(sitemapUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Apropos Research Bot 1.0'
        }
      });

      // If HEAD fails, try GET
      if (!response.ok && response.status !== 302 && response.status !== 301) {
        response = await fetch(sitemapUrl, {
          headers: {
            'User-Agent': 'Apropos Research Bot 1.0'
          },
          redirect: 'follow'
        });
      }

      const sitemapAccessible = response.ok;
      
      if (!sitemapAccessible) {
        return NextResponse.json({
          sitemapAccessible: false,
          hasArticles: false,
          articleCount: 0,
          error: 'Sitemap not accessible'
        });
      }

      // Get content to validate
      const contentResponse = await fetch(sitemapUrl, {
        headers: {
          'User-Agent': 'Apropos Research Bot 1.0'
        },
        redirect: 'follow'
      });

      if (!contentResponse.ok) {
        return NextResponse.json({
          sitemapAccessible: false,
          hasArticles: false,
          articleCount: 0,
          error: 'Could not fetch content'
        });
      }

      const contentType = contentResponse.headers.get('content-type') || '';
      const responseText = await contentResponse.text();

      // Check for valid XML/RSS content
      const hasValidContent = (
        contentType.includes('xml') ||
        contentType.includes('rss') ||
        responseText.includes('<?xml') ||
        responseText.includes('<rss') ||
        responseText.includes('<channel') ||
        responseText.includes('<urlset') ||
        responseText.includes('<sitemapindex') ||
        responseText.includes('<feed')
      );

      // Estimate article count
      let articleCount = 0;
      if (responseText.includes('<item>')) {
        articleCount = (responseText.match(/<item>/g) || []).length;
      } else if (responseText.includes('<url>')) {
        articleCount = (responseText.match(/<url>/g) || []).length;
      } else if (responseText.includes('<entry>')) {
        articleCount = (responseText.match(/<entry>/g) || []).length;
      } else if (responseText.includes('<sitemap>')) {
      // For sitemap indexes, try to follow and count articles in all sitemaps
      try {
        const sitemapMatches = responseText.match(/<sitemap>[\s\S]*?<\/sitemap>/g);
        console.log('Found sitemap matches:', sitemapMatches?.length || 0);
        if (sitemapMatches) {
          let totalArticles = 0;
          let collectedUrls: string[] = []; // Collect URLs for analysis
            // Limit to first 5 sitemaps to avoid timeout
            for (let i = 0; i < Math.min(sitemapMatches.length, 5); i++) {
              const sitemapMatch = sitemapMatches[i];
              const urlMatch = sitemapMatch.match(/<loc>(.*?)<\/loc>/);
              if (urlMatch) {
                const sitemapUrl = urlMatch[1];
                console.log('Fetching sitemap:', sitemapUrl);
                try {
                  const subResponse = await fetch(sitemapUrl, {
                    headers: { 'User-Agent': 'Apropos Research Bot 1.0' },
                    redirect: 'follow',
                    signal: AbortSignal.timeout(5000) // 5 second timeout per sitemap
                  });
                  if (subResponse.ok) {
                    const subContent = await subResponse.text();
                    console.log('Sub sitemap content length:', subContent.length);
                    // Count articles in this sitemap
                    if (subContent.includes('<item>')) {
                      const count = (subContent.match(/<item>/g) || []).length;
                      totalArticles += count;
                      console.log('Found RSS items:', count);
                      // Extract URLs from RSS items
                      const itemMatches = subContent.match(/<item>[\s\S]*?<\/item>/g);
                      if (itemMatches) {
                        for (const item of itemMatches.slice(0, 10)) { // Limit to first 10 items
                          const linkMatch = item.match(/<link>(.*?)<\/link>/);
                          if (linkMatch) {
                            collectedUrls.push(linkMatch[1]);
                          }
                        }
                      }
                    } else if (subContent.includes('<url>')) {
                      const count = (subContent.match(/<url>/g) || []).length;
                      totalArticles += count;
                      console.log('Found URLs:', count);
                      // Extract URLs from sitemap
                      const urlMatches = subContent.match(/<url>[\s\S]*?<\/url>/g);
                      if (urlMatches) {
                        for (const url of urlMatches.slice(0, 10)) { // Limit to first 10 URLs
                          const locMatch = url.match(/<loc>(.*?)<\/loc>/);
                          if (locMatch) {
                            collectedUrls.push(locMatch[1]);
                          }
                        }
                      }
                    } else if (subContent.includes('<entry>')) {
                      const count = (subContent.match(/<entry>/g) || []).length;
                      totalArticles += count;
                      console.log('Found entries:', count);
                      // Extract URLs from Atom entries
                      const entryMatches = subContent.match(/<entry>[\s\S]*?<\/entry>/g);
                      if (entryMatches) {
                        for (const entry of entryMatches.slice(0, 10)) { // Limit to first 10 entries
                          const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["']/);
                          if (linkMatch) {
                            collectedUrls.push(linkMatch[1]);
                          }
                        }
                      }
                    } else if (subContent.includes('<sitemap>')) {
                      // This is another sitemap index, follow it too
                      console.log('Found nested sitemap index');
                      const nestedMatches = subContent.match(/<sitemap>[\s\S]*?<\/sitemap>/g);
                      if (nestedMatches) {
                        for (let j = 0; j < Math.min(nestedMatches.length, 3); j++) {
                          const nestedMatch = nestedMatches[j];
                          const nestedUrlMatch = nestedMatch.match(/<loc>(.*?)<\/loc>/);
                          if (nestedUrlMatch) {
                            const nestedUrl = nestedUrlMatch[1];
                            console.log('Fetching nested sitemap:', nestedUrl);
                            try {
                              const nestedResponse = await fetch(nestedUrl, {
                                headers: { 'User-Agent': 'Apropos Research Bot 1.0' },
                                redirect: 'follow',
                                signal: AbortSignal.timeout(3000)
                              });
                              if (nestedResponse.ok) {
                                const nestedContent = await nestedResponse.text();
                                if (nestedContent.includes('<url>')) {
                                  const nestedCount = (nestedContent.match(/<url>/g) || []).length;
                                  totalArticles += nestedCount;
                                  console.log('Found nested URLs:', nestedCount);
                                } else if (nestedContent.includes('<sitemap>')) {
                                  // Third level sitemap index - follow it too
                                  console.log('Found third level sitemap index');
                                  const thirdLevelMatches = nestedContent.match(/<sitemap>[\s\S]*?<\/sitemap>/g);
                                  if (thirdLevelMatches) {
                                    for (let k = 0; k < Math.min(thirdLevelMatches.length, 2); k++) {
                                      const thirdLevelMatch = thirdLevelMatches[k];
                                      const thirdLevelUrlMatch = thirdLevelMatch.match(/<loc>(.*?)<\/loc>/);
                                      if (thirdLevelUrlMatch) {
                                        const thirdLevelUrl = thirdLevelUrlMatch[1];
                                        console.log('Fetching third level sitemap:', thirdLevelUrl);
                                        try {
                                          const thirdLevelResponse = await fetch(thirdLevelUrl, {
                                            headers: { 'User-Agent': 'Apropos Research Bot 1.0' },
                                            redirect: 'follow',
                                            signal: AbortSignal.timeout(2000)
                                          });
                                          if (thirdLevelResponse.ok) {
                                            const thirdLevelContent = await thirdLevelResponse.text();
                                            if (thirdLevelContent.includes('<url>')) {
                                              const thirdLevelCount = (thirdLevelContent.match(/<url>/g) || []).length;
                                              totalArticles += thirdLevelCount;
                                              console.log('Found third level URLs:', thirdLevelCount);
                                              // Extract URLs from third level sitemap
                                              const thirdLevelUrlMatches = thirdLevelContent.match(/<url>[\s\S]*?<\/url>/g);
                                              if (thirdLevelUrlMatches) {
                                                for (const url of thirdLevelUrlMatches.slice(0, 5)) { // Limit to first 5 URLs
                                                  const locMatch = url.match(/<loc>(.*?)<\/loc>/);
                                                  if (locMatch) {
                                                    collectedUrls.push(locMatch[1]);
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        } catch (error) {
                                          console.warn(`Failed to fetch third level sitemap ${thirdLevelUrl}:`, error);
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            } catch (error) {
                              console.warn(`Failed to fetch nested sitemap ${nestedUrl}:`, error);
                            }
                          }
                        }
                      }
                    }
                  }
                } catch (error) {
                  // Continue with other sitemaps if one fails
                  console.warn(`Failed to fetch sitemap ${sitemapUrl}:`, error);
                }
              }
            }
            articleCount = totalArticles;
            
            // Analyze collected URLs to detect tag/metadata pages
            let urlAnalysis = null;
            if (collectedUrls.length > 0) {
              urlAnalysis = analyzeUrlTypes(collectedUrls);
              console.log('URL Analysis:', urlAnalysis);
              
              // If more than 80% are tag pages, this sitemap is not suitable
              if (urlAnalysis.tagCount > 0 && urlAnalysis.tagCount / (urlAnalysis.articleCount + urlAnalysis.tagCount) > 0.8) {
                return NextResponse.json({
                  sitemapAccessible: true,
                  hasArticles: false,
                  articleCount: 0,
                  contentType,
                  contentPreview: responseText.slice(0, 500),
                  warning: `${baseUrl} er ikke egnet til vores system da deres sitemap kun indeholder tag-sider, ikke artikler.`,
                  urlAnalysis: {
                    totalUrls: collectedUrls.length,
                    articleCount: urlAnalysis.articleCount,
                    tagCount: urlAnalysis.tagCount,
                    sampleUrls: urlAnalysis.sampleUrls
                  }
                });
              }
            }
          } else {
            // Fallback: count sitemaps if we can't parse them
            articleCount = (responseText.match(/<sitemap>/g) || []).length;
          }
        } catch (error) {
          // Fallback: count sitemaps if we can't follow them
          articleCount = (responseText.match(/<sitemap>/g) || []).length;
        }
      }

      return NextResponse.json({
        sitemapAccessible: true,
        hasArticles: hasValidContent,
        articleCount,
        contentType,
        contentPreview: responseText.substring(0, 500) + '...'
      });

    } catch (error) {
      return NextResponse.json({
        sitemapAccessible: false,
        hasArticles: false,
        articleCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

  } catch (error) {
    console.error('Error validating media source:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
