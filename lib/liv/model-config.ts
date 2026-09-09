/** Server-owned model selection. Never accept arbitrary model IDs from request bodies. */
export function livModels() {
  const selected = {
    article: process.env.LIV_GENERATION_MODEL?.trim() || 'gpt-5.6-sol',
    research: process.env.LIV_RESEARCH_MODEL?.trim() || 'gpt-5.6-sol',
    utility: process.env.LIV_UTILITY_MODEL?.trim() || 'gpt-5.6-luna',
  };
  if (Object.values(selected).some(model => !/^gpt-[a-z0-9.-]+$/i.test(model))) {
    throw new Error('liv_model_invalid: Liv kræver OpenAI-model-ID’er. Kontrollér LIV_*_MODEL.');
  }
  return selected;
}
