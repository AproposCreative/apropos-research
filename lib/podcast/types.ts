export type PodcastJobStep =
  | 'queued'
  | 'metadata'
  | 'encode'
  | 'manifest'
  | 'notification'
  | 'cleanup'
  | 'done';

export type PodcastJobStatus = 'queued' | 'processing' | 'done' | 'error';

/** iOS-kompatibelt manifest-entry (PodcastManifestEntry.swift) */
export type PodcastManifestEpisode = {
  id: string;
  articleSlug: string;
  title: string;
  subtitle: string;
  audioURL: string;
  hosts: string[];
  publishedAt: string;
  /** Kun til web-UI — ikke sendt til iOS-decode */
  articleUrl?: string;
};

export type PodcastManifest = {
  version: number;
  updatedAt: string;
  episodes: PodcastManifestEpisode[];
};

export type ResolvedArticle = {
  found: true;
  slug: string;
  title: string;
  authorName: string | null;
  articleUrl: string;
  source: 'firestore' | 'webflow';
};

export type PodcastJobDoc = {
  jobId: string;
  slug: string;
  articleUrl: string;
  title?: string;
  status: PodcastJobStatus;
  step: PodcastJobStep;
  failedStep?: PodcastJobStep;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
