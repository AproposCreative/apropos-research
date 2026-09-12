import type { LivHeroDimensions } from './hero-dimensions';
/** Serializable provenance, not a publishing or copyright approval. */
export type LivSelectedImage = {
  id: string;
  articleHash: string;
  url: string;
  storagePath: string;
  sourceUrl: string;
  sourcePageUrl: string | null;
  contentHash: string;
  sourceHash: string;
  bytes: number;
  alt: string;
  credit: string;
  createdAt: string;
  rightsStatus: 'unverified';
  visualReview: 'pending' | 'automated';
} & LivHeroDimensions;
