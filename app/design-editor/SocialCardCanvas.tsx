'use client';

import { useEffect, useRef, useState } from 'react';
import { exportCardToPng } from './exportCardToPng';

export type SocialCardSize = 'story' | 'square';
export const DIMENSIONS = { story: { width: 1080, height: 1920 }, square: { width: 1080, height: 1080 } };

export interface SocialCardData {
  theme?: 'light' | 'dark';
  title: string;
  excerpt?: string;
  imageUrl?: string | null;
  /** e.g. "Koncert", "Anmeldelse" – shown as "Koncert | Anmeldelse" or single */
  category?: string;
  /** Second tag/category (optional) */
  categorySecondary?: string;
  /** Head & Eyebrow: labels from CMS (Section, Primary Topic, Topics, Author). Overrides category when set. */
  eyebrowLabels?: string[];
  /** Story-only: bottom metadata row, e.g. ["Kultur & Mening", "Liv Brandt"] */
  storyBottomMetaLabels?: string[];
  /** 0–6 star rating */
  rating?: number;
  caption?: string;
}

interface SocialCardCanvasProps {
  data: SocialCardData;
  size: SocialCardSize;
  className?: string;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

/** Every preview uses the same font fitting, theme and drawing as PNG/JPEG export. */
export default function SocialCardCanvas({ data, size, className = '', cardRef }: SocialCardCanvasProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const root = cardRef || localRef;
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setError(false);
    const font = root.current ? getComputedStyle(root.current).getPropertyValue('--font-amiri').trim() : '';
    exportCardToPng(data, size, { amiriFontFamily: font || undefined })
      .then(value => { if (!cancelled) setImage(value); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [data, size, root]);
  return <div ref={root} className={className} style={{ ...DIMENSIONS[size], background: data.theme === 'dark' ? '#000' : '#fff' }}>
    {image ? <img src={image} alt={[data.title, data.excerpt].filter(Boolean).join(' — ')} width={DIMENSIONS[size].width} height={DIMENSIONS[size].height} />
      : <p role="status" style={{ color: data.theme === 'dark' ? '#fff' : '#000' }}>{error ? 'Forhåndsvisningen kunne ikke dannes.' : 'Danner forhåndsvisning…'}</p>}
  </div>;
}
