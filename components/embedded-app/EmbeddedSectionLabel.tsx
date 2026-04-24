'use client';

import type { ReactNode } from 'react';

/** Nummereret sektionstitler i AI-posting el.l. */
export function EmbeddedSectionLabel({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-0.5 pt-1 pb-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] text-[11px] font-medium tabular-nums text-white/80">
        {step}
      </span>
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/55">{children}</p>
    </div>
  );
}
