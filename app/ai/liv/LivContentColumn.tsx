import type { ReactNode } from 'react';

/** Shared edges for navigation, headings and cards across Liv's views. */
export default function LivContentColumn({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[640px] px-4 sm:px-5 ${className}`}>{children}</div>;
}
