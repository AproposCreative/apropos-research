import fs from 'fs';
import path from 'path';

export type MappingEntry = {
  internal: string; // our internal key, e.g. title, content, authorId
  webflowSlug: string; // webflow field slug, e.g. name, post-body
  transform?: 'identity' | 'plainToHtml' | 'markdownToHtml' | 'stringArray' | 'dateIso' | 'referenceId' | 'boolean' | 'number' | 'cleanIntro';
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
    { internal: 'slug', webflowSlug: 'slug', transform: 'identity', required: true },
    { internal: 'subtitle', webflowSlug: 'subtitle', transform: 'identity' },
    { internal: 'intro', webflowSlug: 'intro', transform: 'cleanIntro' },
    { internal: 'content', webflowSlug: 'content', transform: 'plainToHtml', required: true },
    { internal: 'excerpt', webflowSlug: 'excerpt', transform: 'identity' },
    { internal: 'seoTitle', webflowSlug: 'seo-title', transform: 'identity', required: true },
    { internal: 'seoDescription', webflowSlug: 'meta-description', transform: 'identity', required: true },
    { internal: 'category', webflowSlug: 'section', transform: 'identity' },
    { internal: 'section', webflowSlug: 'section', transform: 'identity' },
    { internal: 'topic', webflowSlug: 'topic', transform: 'identity' },
    { internal: 'topic_two', webflowSlug: 'topic-two', transform: 'identity' },
    { internal: 'tags', webflowSlug: 'tags', transform: 'stringArray' },
    { internal: 'author', webflowSlug: 'author', transform: 'referenceId' },
    { internal: 'rating', webflowSlug: 'stjerne', transform: 'number' },
    { internal: 'streaming_service', webflowSlug: 'watch-now-link', transform: 'identity' },
    { internal: 'platform', webflowSlug: 'streaming-service', transform: 'identity' },
    { internal: 'minutes_to_read', webflowSlug: 'minutes-to-read', transform: 'number' },
    { internal: 'readTime', webflowSlug: 'minutes-to-read', transform: 'number' },
    { internal: 'wordCount', webflowSlug: 'word-count', transform: 'number' },
    { internal: 'featured', webflowSlug: 'featured', transform: 'boolean' },
    { internal: 'trending', webflowSlug: 'trending', transform: 'boolean' },
    { internal: 'presseakkreditering', webflowSlug: 'presseakkreditering', transform: 'boolean' },
    { internal: 'festival', webflowSlug: 'festival', transform: 'identity' },
    { internal: 'location', webflowSlug: 'location', transform: 'identity' },
    { internal: 'start_dato', webflowSlug: 'start-dato', transform: 'dateIso' },
    { internal: 'slut_dato', webflowSlug: 'slut-dato', transform: 'dateIso' },
    { internal: 'buy_tickets', webflowSlug: 'buy-tickets', transform: 'identity' },
    { internal: 'featuredImage', webflowSlug: 'thumb', transform: 'identity' },
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

