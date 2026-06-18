export const EDITORIAL_PUBLISHED_SIGNALS_KEY = 'apropos-editorial-published-signals';
export const EDITORIAL_COVERED_TOPICS_KEY = 'apropos-editorial-covered-topics';
export const EDITORIAL_SIGNAL_PUBLISHED_EVENT = 'apropos:editorial-signal-published';

export type EditorialArticleType =
  | 'short-news'
  | 'review'
  | 'feature'
  | 'analysis'
  | 'commentary'
  | 'longread';

export type EditorialArticleTypeOption = {
  id: EditorialArticleType;
  label: string;
  description: string;
  targetWordCount: number;
  targetLengthLabel: string;
};

export type CoveredEditorialTopic = {
  signalId?: string;
  signalTitle?: string;
  title?: string;
  slug?: string;
  topic?: string;
  publishedAt: string;
};

export const EDITORIAL_ARTICLE_TYPE_OPTIONS: EditorialArticleTypeOption[] = [
  {
    id: 'short-news',
    label: 'Kort nyhed',
    description: 'Hurtig, skarp og aktuel',
    targetWordCount: 550,
    targetLengthLabel: '450-650 ord',
  },
  {
    id: 'review',
    label: 'Anmeldelse',
    description: 'Vurdering med oplevelse og kontekst',
    targetWordCount: 950,
    targetLengthLabel: '800-1100 ord',
  },
  {
    id: 'feature',
    label: 'Feature',
    description: 'Fortællende kulturartikel',
    targetWordCount: 1250,
    targetLengthLabel: '1100-1400 ord',
  },
  {
    id: 'analysis',
    label: 'Analyse',
    description: 'Kontekst, mønstre og konsekvens',
    targetWordCount: 1050,
    targetLengthLabel: '900-1200 ord',
  },
  {
    id: 'commentary',
    label: 'Kommentar/essay',
    description: 'Tydelig holdning og refleksion',
    targetWordCount: 1150,
    targetLengthLabel: '1000-1300 ord',
  },
  {
    id: 'longread',
    label: 'Longread',
    description: 'Dyb research og flere lag',
    targetWordCount: 1600,
    targetLengthLabel: '1400-1800 ord',
  },
];

export function getEditorialArticleTypeOption(value?: string | null): EditorialArticleTypeOption {
  return EDITORIAL_ARTICLE_TYPE_OPTIONS.find((option) => option.id === value) || EDITORIAL_ARTICLE_TYPE_OPTIONS[2];
}

export function normalizeEditorialText(input: unknown): string {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function editorialSlug(input: unknown): string {
  return normalizeEditorialText(input).replace(/\s+/g, '-').slice(0, 100).replace(/^-|-$/g, '');
}

function readJsonArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, items: T[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(items));
}

export function readPublishedEditorialSignalIds(): string[] {
  return readJsonArray<string>(EDITORIAL_PUBLISHED_SIGNALS_KEY).filter((id) => typeof id === 'string');
}

export function addPublishedEditorialSignalId(signalId: string): string[] {
  const clean = signalId.trim();
  if (!clean) return readPublishedEditorialSignalIds();
  const ids = new Set(readPublishedEditorialSignalIds());
  ids.add(clean);
  const next = [...ids];
  writeJsonArray(EDITORIAL_PUBLISHED_SIGNALS_KEY, next);
  return next;
}

export function readCoveredEditorialTopics(): CoveredEditorialTopic[] {
  return readJsonArray<CoveredEditorialTopic>(EDITORIAL_COVERED_TOPICS_KEY).filter(
    (item) => item && typeof item === 'object'
  );
}

export function addCoveredEditorialTopic(topic: Omit<CoveredEditorialTopic, 'publishedAt'> & { publishedAt?: string }) {
  const nextTopic: CoveredEditorialTopic = {
    ...topic,
    slug: topic.slug || editorialSlug(topic.title || topic.signalTitle || topic.topic || topic.signalId),
    publishedAt: topic.publishedAt || new Date().toISOString(),
  };
  const key = normalizeEditorialText(
    nextTopic.slug || nextTopic.title || nextTopic.signalTitle || nextTopic.topic || nextTopic.signalId
  );
  if (!key) return readCoveredEditorialTopics();

  const existing = readCoveredEditorialTopics().filter((item) => {
    const existingKey = normalizeEditorialText(item.slug || item.title || item.signalTitle || item.topic || item.signalId);
    return existingKey !== key;
  });
  const next = [nextTopic, ...existing].slice(0, 100);
  writeJsonArray(EDITORIAL_COVERED_TOPICS_KEY, next);
  return next;
}

export function isEditorialTopicCovered(
  candidate: { id?: string; title?: string; angle?: string; beat?: string },
  coveredTopics: CoveredEditorialTopic[]
): boolean {
  const candidateText = normalizeEditorialText(
    [candidate.id, candidate.title, candidate.angle, candidate.beat].filter(Boolean).join(' ')
  );
  if (!candidateText) return false;

  return coveredTopics.some((topic) => {
    const coveredText = normalizeEditorialText(
      [topic.signalId, topic.signalTitle, topic.title, topic.slug, topic.topic].filter(Boolean).join(' ')
    );
    if (!coveredText) return false;
    return candidateText.includes(coveredText) || coveredText.includes(candidateText);
  });
}

