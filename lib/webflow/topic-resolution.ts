export type WebflowTopicItem = {
  id: string; cmsLocaleId?: string; isArchived?: boolean; isDraft?: boolean;
  fieldData: { name?: string; title?: string; slug?: string };
};
const objectId = /^[a-f0-9]{24}$/i;
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{Diacritic}+/gu, '').toLowerCase()
  .replace(/&/g, ' og ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const aliases: Record<string, string> = {
  kultur: 'kultur og mening', 'kultur mening': 'kultur og mening',
  tv: 'tv serier', serier: 'tv serier', 'tv series': 'tv serier',
  anmeldelse: 'anmeldelser', koncert: 'koncerter',
};
const canonical = (value: string) => aliases[normalize(value)] || normalize(value);

/** No prefixes, substrings, similarity scores or arbitrary first match. */
export function resolveWebflowTopicId(selection: string, items: WebflowTopicItem[]): string | undefined {
  const value = selection.trim();
  if (!value) return undefined;
  const eligible = items.filter(item => objectId.test(item.id) && item.isArchived !== true && item.isDraft !== true);
  const labels = (item: WebflowTopicItem) => [item.fieldData.name, item.fieldData.title, item.fieldData.slug]
    .filter((name): name is string => typeof name === 'string' && !!name.trim());
  const exact = eligible.filter(item => objectId.test(value) ? item.id.toLowerCase() === value.toLowerCase()
    : labels(item).some(name => normalize(name) === normalize(value)));
  const matches = exact.length || objectId.test(value) ? exact
    : eligible.filter(item => labels(item).some(name => canonical(name) === canonical(value)));
  const ids = [...new Set(matches.map(item => item.id))];
  if (ids.length > 1) throw new Error('webflow_topic_ambiguous');
  return ids[0];
}

/** Free-form tags are candidates, not an instruction to create new CMS topics. */
export function resolveWebflowTopics(selections: string[], items: WebflowTopicItem[]): string[] {
  if (!selections.length || selections.length > 100 || selections.some(value => typeof value !== 'string' || value.length > 300)) {
    throw new Error('webflow_topics_invalid');
  }
  const ids = [...new Set(selections.map(value => resolveWebflowTopicId(value, items)).filter((id): id is string => !!id))];
  if (!ids.length) throw new Error('webflow_topics_unresolved');
  return ids;
}

/** One bounded collection scan per operation, shared by all selected tags.
 * Never return a partial taxonomy after an HTTP/parse/pagination failure.
 */
export async function readWebflowTopicCollection(readPage: (offset: number) => Promise<unknown>, localeId?: string): Promise<WebflowTopicItem[]> {
  const items: WebflowTopicItem[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const value = await readPage(offset);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('webflow_topics_invalid_response');
    const page = value as { items?: WebflowTopicItem[]; pagination?: { total?: number; offset?: number } };
    if (!Array.isArray(page.items) || page.items.length > 100 || page.items.some(item => !item || !objectId.test(item.id) ||
      !item.fieldData || typeof item.fieldData !== 'object' || Array.isArray(item.fieldData))) throw new Error('webflow_topics_invalid_response');
    const total = page.pagination?.total;
    if (page.pagination?.offset !== undefined && page.pagination.offset !== offset ||
      total !== undefined && (!Number.isSafeInteger(total) || total < offset + page.items.length || total > 5000)) {
      throw new Error('webflow_topics_invalid_pagination');
    }
    items.push(...page.items.filter(item => !localeId || item.cmsLocaleId === localeId));
    if (total !== undefined ? offset + page.items.length === total : page.items.length < 100) return items;
    if (page.items.length !== 100) throw new Error('webflow_topics_incomplete');
  }
  throw new Error('webflow_topics_too_large');
}
