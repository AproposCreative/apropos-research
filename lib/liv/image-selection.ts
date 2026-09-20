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
  /** Immutable operator copyedit whose changed text requires fresh media proof. */
  editorialEdit?: { runId: string; requestId: string };
  /** One audited caption-only fallback to an already verified alt description. */
  captionRepairId?: string;
} & LivHeroDimensions;
