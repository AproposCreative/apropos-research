import fs from 'fs';
import path from 'path';

export type MappingEntry = {
  internal: string; // our internal key, e.g. title, content, authorId
  webflowSlug: string; // webflow field slug, e.g. name, post-body
  transform?: 'identity' | 'plainToHtml' | 'markdownToHtml' | 'stringArray' | 'dateIso' | 'referenceId' | 'boolean' | 'number';
  required?: boolean;
};

export type WebflowMapping = {
  collectionId?: string; // articles collection id (for drift detection)
  entries: MappingEntry[];
};

const MAPPING_FILE = path.join(process.cwd(), 'data', 'webflow-mapping.json');

const DEFAULT_MAPPING: WebflowMapping = {
  entries: [
    { internal: 'title', webflowSlug: 'name', transform: 'identity', required: true },
    { internal: 'slug', webflowSlug: 'slug', transform: 'identity' },
    { internal: 'subtitle', webflowSlug: 'subtitle', transform: 'identity' },
    { internal: 'content', webflowSlug: 'post-body', transform: 'identity', required: true },
    { internal: 'excerpt', webflowSlug: 'excerpt', transform: 'identity' },
    { internal: 'category', webflowSlug: 'category', transform: 'identity' },
    { internal: 'tags', webflowSlug: 'tags', transform: 'stringArray' },
    { internal: 'author', webflowSlug: 'author', transform: 'referenceId' },
    { internal: 'rating', webflowSlug: 'rating', transform: 'number' },
    { internal: 'featuredImage', webflowSlug: 'featured-image', transform: 'identity' },
    { internal: 'publishDate', webflowSlug: 'publish-date', transform: 'dateIso' },
    { internal: 'status', webflowSlug: 'status', transform: 'identity' },
    { internal: 'seoTitle', webflowSlug: 'seo-title', transform: 'identity' },
    { internal: 'seoDescription', webflowSlug: 'seo-description', transform: 'identity' },
    { internal: 'readTime', webflowSlug: 'read-time', transform: 'number' },
    { internal: 'wordCount', webflowSlug: 'word-count', transform: 'number' },
    { internal: 'featured', webflowSlug: 'featured', transform: 'boolean' },
    { internal: 'trending', webflowSlug: 'trending', transform: 'boolean' },
  ],
};

export function readMapping(): WebflowMapping {
  try {
    if (fs.existsSync(MAPPING_FILE)) {
      const txt = fs.readFileSync(MAPPING_FILE, 'utf8');
      const parsed = JSON.parse(txt);
      if (parsed && Array.isArray(parsed.entries)) return parsed as WebflowMapping;
    }
  } catch {}
  return DEFAULT_MAPPING;
}

export function saveMapping(mapping: WebflowMapping) {
  try {
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save webflow-mapping.json', e);
  }
}


