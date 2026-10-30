'use client';

import { useState } from 'react';
import { textSizePercent, TEXT_SIZE_STEP } from './cardTextSize';

export type TextSizeControl = {
  percent: number; increase: () => void; decrease: () => void; reset: () => void;
};

/** Article/source-bound choices shared across formats, independent of AI copy. */
export function useCardTextSize(articleKey: string) {
  const [sizes, setSizes] = useState<Record<string, { title?: number; subtitle?: number }>>({});
  const control = (field: 'title' | 'subtitle'): TextSizeControl => {
    const update = (delta: number | null) => setSizes(previous => ({ ...previous,
      [articleKey]: { ...previous[articleKey], [field]: delta === null ? 100 :
        textSizePercent((previous[articleKey]?.[field] ?? 100) + delta) },
    }));
    return { percent: sizes[articleKey]?.[field] ?? 100,
      increase: () => update(TEXT_SIZE_STEP), decrease: () => update(-TEXT_SIZE_STEP), reset: () => update(null) };
  };
  return { title: control('title'), subtitle: control('subtitle'),
    restore: (title: number, subtitle: number) => setSizes(previous => ({ ...previous,
      [articleKey]: { title: textSizePercent(title), subtitle: textSizePercent(subtitle) } })) };
}
