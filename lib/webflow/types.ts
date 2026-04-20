/**
 * Webflow shared types.
 *
 * Extracted fra `lib/webflow-service.ts` for at gøre typerne genbrugelige
 * uden at skulle importere hele service-laget (som er server-only). Modulet
 * indeholder kun rene typer/interfaces — ingen runtime-kode — så det er
 * sikkert at importere fra både client og server.
 */

export interface WebflowAuthor {
  id: string;
  name: string;
  slug: string;
  bio?: string;
  avatar?: string;
  email?: string;
  social?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };
  /** Tone-of-voice beskrivelse — bruges af AI-prompts. */
  tov?: string;
  /** Skribent-specialer — bruges til topic-routing. */
  specialties?: string[];
}

export interface WebflowArticleFields {
  id: string;
  /** ID på eksisterende Webflow-artikel — sat ved opdatering. */
  webflowId?: string;
  title: string;
  slug: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  intro?: string;
  category: string;
  tags: string[];
  author: string;
  rating?: number;
  featuredImage?: string;
  gallery?: string[];
  publishDate?: string;
  status: 'draft' | 'published' | 'archived';
  seoTitle?: string;
  seoDescription?: string;
  readTime?: number;
  wordCount?: number;
  featured?: boolean;
  trending?: boolean;
  /** Canonical Webflow press accreditation field. */
  presseakkreditering?: boolean | null;
  /** Legacy alias used in SetupWizard (kept for backwards compat). */
  press?: boolean | null;
  /**
   * Markerer artikler genereret af AI-pipelines (fx Liv's daglige auto-publish).
   * Sættes til `true` af `app/api/cron/liv-daily-article` og bruges af
   * frontend/nyhedsbrev til at filtrere eller mærke AI-indhold.
   */
  aiGenerated?: boolean | null;
  /** URL til original kilde — sporbarhed for AI-genererede artikler. */
  aiSourceUrl?: string | null;
  /** Hvilken model der genererede artiklen, fx "claude-opus-4.7". */
  aiModel?: string | null;
  topicsSelected?: string[];
  streaming_service?: string;
  platform?: string;
  watchUrl?: string;
  streamingUrl?: string;
  videoTrailer?: string;
  video_trailer?: string;
}

export type WebflowStatus = {
  connected: boolean;
  hasToken: boolean;
  hasSiteId: boolean;
  hasAuthorsCollectionId: boolean;
  hasArticlesCollectionId: boolean;
  tokenPreview?: string;
  siteId?: string;
  authorsCollectionId?: string;
  articlesCollectionId?: string;
  apiReachable?: boolean;
  collectionsReachable?: boolean;
  error?: string;
};

export type WebflowFieldMeta = {
  id?: string;
  name?: string;
  slug: string;
  type?: string;
  required?: boolean;
  unique?: boolean;
  editable?: boolean;
  isSystem?: boolean;
  validations?: unknown;
  reference?: { collectionId?: string; isMulti?: boolean };
  options?: unknown[];
};
