import { getOpenAIClient } from '@/lib/openai';
import { articleUnits, assessGroundedReport, groundedResponseFormat } from './grounded';
import { retrieveSource, sourceUrl, type RetrievedSource } from './source-reader';
import { livModels } from '@/lib/liv/model-config';
import { groundedSystemPrompt } from './grounded-prompt';

export async function verifyArticleSources(articleText: string, sourceUrls: string[]) {
  const client = getOpenAIClient();
  if (!client) throw new Error('Faktakontrol er ikke konfigureret.');
  const urls = [...new Set(sourceUrls.map(value => sourceUrl(value).href))];
  const sources: RetrievedSource[] = [];
  // Bounded concurrency and per-source deadline. A failed source never becomes evidence.
  for (let index = 0; index < urls.length; index += 4) {
    const fetched = await Promise.allSettled(urls.slice(index, index + 4)
      .map((url, offset) => retrieveSource(url, `s${index + offset + 1}`)));
    for (const source of fetched) if (source.status === 'fulfilled') sources.push(source.value);
  }
  const datedHosts = new Set(sources.filter(source => source.publishedAt)
    .map(source => new URL(source.url).hostname.replace(/^www\./, '')));
  if (datedHosts.size < 2) {
    return assessGroundedReport(articleText, sources, null, Date.now(), {
      code: 'insufficient_dated_sources',
      message: `Kildehentningen gav kun ${datedHosts.size} forskellige kildeværter med publiceringsdato; mindst 2 kræves. Modellen blev ikke kaldt.`,
    });
  }
  // Bound review scope per call. A long mixed feature otherwise encourages the
  // model to collapse all claims into u1 and silently omit the remaining units.
  const units = articleUnits(articleText);
  const responses = [];
  const deadline = Date.now() + 90_000;
  for (let start = 0; start < units.length; start += 4) {
    const timeout = start === 0 ? 90_000 : deadline - Date.now();
    if (timeout < 1000) throw new Error('Faktakontrollens tidsbudget er opbrugt.');
    responses.push(...await Promise.all(units.slice(start, start + 4).map(async unit => {
  const request = {
    model: livModels().research,
    reasoning_effort: 'low' as const,
    response_format: groundedResponseFormat,
    max_completion_tokens: 8_000,
    messages: [{ role: 'system' as const, content: groundedSystemPrompt },
    { role: 'user' as const, content: JSON.stringify({ today: new Date().toISOString(), units: [unit], sources,
      requiredUnitId: unit.id, instruction: 'Kontroller kun dette tekstafsnit. Returner præcis denne ene unit med dens oprindelige id. Udelad holdninger fra claims, men kontroller alle faktuelle præmisser.' }) }],
  };
  try {
    return await client.chat.completions.create(request, { timeout, maxRetries: 0 });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    // One bounded retry of this read-only verification, never of successful
    // units or a CMS write. Auth, quota and editorial rejections are not retried.
    if (!status || status < 500 || status > 599 || deadline - Date.now() < 2000) throw error;
    await new Promise(resolve => setTimeout(resolve, 500));
    return client.chat.completions.create(request, { timeout: Math.max(1, deadline - Date.now()), maxRetries: 0 });
  }
    })));
  }
  if (responses.some(response => response.choices[0]?.finish_reason !== 'stop')) return assessGroundedReport(articleText, sources, null, Date.now(), {
    code: 'model_response_incomplete', message: 'Modellen afsluttede ikke faktakontrollen. Ingen godkendelse.',
  });
  let assessment: unknown;
  try {
    const parts = responses.map(response => JSON.parse(response.choices[0]?.message?.content || 'null'));
    assessment = parts.every(part => Array.isArray(part?.units)) ? { units: parts.flatMap(part => part.units) } : null;
  } catch {
    return assessGroundedReport(articleText, sources, null, Date.now(), {
      code: 'model_response_invalid_json', message: 'Modellen returnerede ikke gyldig JSON til faktakontrollen. Ingen godkendelse.',
    });
  }
  return assessGroundedReport(articleText, sources, assessment);
}
