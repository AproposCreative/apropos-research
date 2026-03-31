import type OpenAI from 'openai';
import { getOpenAIClient, models } from '@/lib/openai';
import type {
  ResearchProviderClient,
  ResearchRequest,
  ResearchResult,
  ResearchSource,
} from '../types';

interface UrlCitation {
  type: 'url_citation';
  url: string;
  title: string;
  start_index: number;
  end_index: number;
}

function extractSourcesFromOutput(output: any[]): ResearchSource[] {
  const sources: ResearchSource[] = [];
  const seen = new Set<string>();

  for (const item of output) {
    if (item.type !== 'message') continue;
    const contentBlocks: any[] = item.content || [];
    for (const block of contentBlocks) {
      if (block.type !== 'output_text') continue;
      const annotations: UrlCitation[] = (block.annotations || []).filter(
        (a: any) => a.type === 'url_citation',
      );
      for (const ann of annotations) {
        if (!ann.url || seen.has(ann.url)) continue;
        seen.add(ann.url);

        let domain = 'web';
        try { domain = new URL(ann.url).hostname.replace(/^www\./, ''); } catch {}

        const snippetStart = Math.max(0, ann.start_index - 40);
        const snippetEnd = Math.min(block.text.length, ann.end_index + 160);
        const snippet = block.text.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim();

        sources.push({
          title: ann.title || domain,
          url: ann.url,
          source: domain,
          snippet,
        });
      }
    }
  }
  return sources;
}

function extractTextFromOutput(output: any[]): string {
  for (const item of output) {
    if (item.type === 'message') {
      for (const block of item.content || []) {
        if (block.type === 'output_text' && block.text) return block.text;
      }
    }
  }
  return '';
}

function buildContextText(text: string, sources: ResearchSource[]): string {
  if (sources.length > 0) {
    return sources
      .map(s => `- ${s.title}: ${s.snippet.slice(0, 200)}`)
      .join('\n');
  }
  if (text) {
    const lines = text.split(/\n+/).filter(Boolean).slice(0, 8);
    return lines.map(l => `- ${l.slice(0, 200)}`).join('\n');
  }
  return '';
}

export function createOpenAIResponsesProvider(): ResearchProviderClient {
  return {
    name: 'openai_responses',

    async search(request: ResearchRequest): Promise<ResearchResult> {
      const t0 = Date.now();
      const client = getOpenAIClient();
      if (!client) {
        return emptyResult(request.query, Date.now() - t0);
      }

      const response = await (client as any).responses.create({
        model: models.research,
        tools: [{ type: 'web_search' as any }],
        input: `Find factual information about: ${request.query}. Include names, dates, creators, cast, episode counts, platforms, and other concrete details.`,
      });

      const output: any[] = response.output || [];
      const text = extractTextFromOutput(output);
      const sources = extractSourcesFromOutput(output);
      const contextText = buildContextText(text, sources);

      return {
        contextText,
        sources: sources.slice(0, request.maxResults),
        debug: {
          provider: 'openai_responses',
          fallbackUsed: false,
          latencyMs: Date.now() - t0,
          query: request.query,
          rawResultCount: sources.length,
          gateScore: 0,
          gateReasons: [],
        },
      };
    },
  };
}

function emptyResult(query: string, latencyMs: number): ResearchResult {
  return {
    contextText: '',
    sources: [],
    debug: {
      provider: 'openai_responses',
      fallbackUsed: false,
      latencyMs,
      query,
      rawResultCount: 0,
      gateScore: 0,
      gateReasons: [],
    },
  };
}
