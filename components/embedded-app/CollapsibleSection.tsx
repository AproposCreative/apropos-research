'use client';

import type { ReactNode } from 'react';

type CollapsibleSectionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  /** Ikon-slot (fx 14px svg i size-7 kasse) */
  icon?: ReactNode;
  children: ReactNode;
};

/**
 * Collapsible section row — matcher design-system “Collapsible / clickable section row”.
 */
export function CollapsibleSection({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`flex items-center gap-3 w-full px-3.5 py-2.5 border-b transition-all duration-200 active:scale-[0.98] text-left ${
          open ? 'border-white/[0.08] bg-white/[0.03]' : 'border-transparent hover:bg-white/[0.03]'
        }`}
        aria-expanded={open}
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
          {icon ?? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white/80">{title}</p>
          {subtitle ? <p className="text-[10px] text-white/30 truncate">{subtitle}</p> : null}
        </div>
        <svg
          className={`size-3.5 shrink-0 text-white/25 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? <div className="px-4 py-4 space-y-3 border-t border-white/[0.06]">{children}</div> : null}
    </div>
  );
}
