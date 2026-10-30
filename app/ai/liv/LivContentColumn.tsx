import type { ReactNode } from 'react';

/** Shared edges for navigation, headings and cards across Liv's views. */
export default function LivContentColumn({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[960px] px-2 sm:px-3 ${className}`}>{children}</div>;
}
