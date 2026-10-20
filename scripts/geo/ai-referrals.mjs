/** Known-source attribution, not a measure of AI answer impressions or citations. */
export const sources = new Map([
 ['chatgpt.com','ChatGPT'], ['chat.openai.com','ChatGPT'],
 ['perplexity.ai','Perplexity'], ['claude.ai','Claude'],
 ['gemini.google.com','Gemini'], ['bard.google.com','Gemini'],
 ['copilot.microsoft.com','Copilot'], ['edgeservices.bing.com','Copilot'],
 ['you.com','You.com'], ['grok.com','Grok'],
]);
export function classifySource(source) {
 // GA4 sessionSource may contain a hostname or a complete URL. Never substring-match.
 let host;
 try { const url = new URL(source.includes('://') ? source : `https://${source}`); if (url.username || url.password) return null; host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./,''); } catch { return null; }
 return sources.get(host) || null;
}
export function summarize(rows) {
 const providers = {}; let allSessions = 0; let aiSessions = 0; let aiEngagedSessions = 0;
 const unmatchedAiTaggedSources = [];
 for (const row of rows) {
  const [source, medium] = row.dimensionValues.map(v => v.value);
  const [sessions, engaged] = row.metricValues.map(v => Number(v.value));
  if (![sessions, engaged].every(v => Number.isFinite(v) && v >= 0)) throw Error('Invalid GA4 metric');
  allSessions += sessions;
  const provider = classifySource(source);
  if (!provider) { if (medium === 'ai-assistant') unmatchedAiTaggedSources.push({source, sessions}); continue; }
  const group = providers[provider] ||= {sessions:0, engagedSessions:0};
  group.sessions += sessions; group.engagedSessions += engaged;
  aiSessions += sessions; aiEngagedSessions += engaged;
 }
 return {allSessions,aiSessions,aiEngagedSessions,aiSessionShare:allSessions ? aiSessions/allSessions : null,aiEngagementRate:aiSessions ? aiEngagedSessions/aiSessions : null,providers,unmatchedAiTaggedSources};
}
