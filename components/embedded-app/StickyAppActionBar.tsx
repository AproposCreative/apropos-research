'use client';

import type { ReactNode } from 'react';

/** Sticky bar til primære handlinger ved scroll i embedded apps */
export function StickyAppActionBar({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`sticky top-0 z-20 -mx-3 px-3 py-2.5 bg-black/75 backdrop-blur-md border-b border-white/10 ${className}`}
    >
      {children}
    </div>
  );
}
