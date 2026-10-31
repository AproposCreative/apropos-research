'use client';

import { useState } from 'react';
import { textSizePercent, TEXT_SIZE_STEP } from './cardTextSize';
import { DEFAULT_TITLE_SUBTITLE_GAP, TITLE_SUBTITLE_GAP_STEP, titleSubtitleGap } from '@/lib/social/card-layout';

export type TextSizeControl = {
  percent: number; increase: () => void; decrease: () => void; reset: () => void;
};
export type TextSpacingControl = { gap: number; increase: () => void; decrease: () => void; reset: () => void };

/** Article/source-bound choices shared across formats, independent of AI copy. */
export function useCardTextSize(articleKey: string) {
  const [sizes, setSizes] = useState<Record<string, { title?: number; subtitle?: number; gap?: number }>>({});
  const control = (field: 'title' | 'subtitle'): TextSizeControl => {
    const update = (delta: number | null) => setSizes(previous => ({ ...previous,
      [articleKey]: { ...previous[articleKey], [field]: delta === null ? 100 :
        textSizePercent((previous[articleKey]?.[field] ?? 100) + delta) },
    }));
    return { percent: sizes[articleKey]?.[field] ?? 100,
      increase: () => update(TEXT_SIZE_STEP), decrease: () => update(-TEXT_SIZE_STEP), reset: () => update(null) };
  };
  const spacing = (delta: number | null) => setSizes(previous => ({ ...previous,
    [articleKey]: { ...previous[articleKey], gap: delta === null ? DEFAULT_TITLE_SUBTITLE_GAP :
      titleSubtitleGap((previous[articleKey]?.gap ?? DEFAULT_TITLE_SUBTITLE_GAP) + delta) },
  }));
  return { title: control('title'), subtitle: control('subtitle'),
    spacing: { gap: sizes[articleKey]?.gap ?? DEFAULT_TITLE_SUBTITLE_GAP,
      increase: () => spacing(TITLE_SUBTITLE_GAP_STEP), decrease: () => spacing(-TITLE_SUBTITLE_GAP_STEP), reset: () => spacing(null) },
    restore: (title: number, subtitle: number, gap?: number) => setSizes(previous => ({ ...previous,
      [articleKey]: { title: textSizePercent(title), subtitle: textSizePercent(subtitle), gap: titleSubtitleGap(gap) } })) };
}
