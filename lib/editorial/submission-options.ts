import { imageGenCmsConfiguration } from '@/lib/image-gen/webflow';
import { readLivWebflowJson } from '@/lib/liv/cms-readback';
import { readWebflowTopicCollection } from '@/lib/webflow/topic-resolution';
import type { SubmissionOptions } from './submission-contract';

/** Live CMS references, without the legacy service's fallback/mock authors. */
export async function getSubmissionOptions(): Promise<SubmissionOptions> {
  const { collection, locale } = imageGenCmsConfiguration();
  const schema = await readLivWebflowJson(`collections/${collection}`);
  if (schema.id !== collection || !Array.isArray(schema.fields)) throw Error('mcp_submission_schema_unavailable');
  const fields = schema.fields as Array<{ slug: string; type: string; isRequired?: boolean; validations?: { collectionId?: string } }>;
  async function references(slugs: string[]) {
    const field = fields.find(f => slugs.includes(f.slug));
    const id = field?.validations?.collectionId;
    if (!id || !/^[a-f0-9]{24}$/.test(id)) return [];
    const rows = await readWebflowTopicCollection(offset => readLivWebflowJson(
      `collections/${id}/items?cmsLocaleId=${locale}&offset=${offset}&limit=100`), locale);
    return rows.filter(row => !row.isArchived && !row.isDraft).map(row => ({ id: row.id, name: String(row.fieldData.name || '') })).filter(row => row.name);
  }
  const [authors, categories, topics] = await Promise.all([references(['author']), references(['category', 'section']), references(['topics'])]);
  return { authors, categories, topics, requiredFields: fields.filter(f => f.isRequired).map(f => f.slug), checkedAt: new Date().toISOString() };
}
