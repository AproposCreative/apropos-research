'use client';
import { useSearchParams, usePathname } from 'next/navigation';
import { Suspense } from 'react';

function DynamicHeaderInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const source = searchParams.get('source');
  
  const getHeaderText = () => {
    if (pathname === '/editorial-queue') {
      return 'Editorial Queue';
    }
    if (pathname === '/ai-drafts') {
      return 'AI Drafts';
    }
    if (source) {
      return source.toUpperCase();
    }
    if (pathname === '/') {
      return 'Home';
    }
    return 'Apropos Research';
  };

  return (
    <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
      {getHeaderText()}
    </div>
  );
}

export default function DynamicHeader() {
  return (
    <Suspense fallback={
      <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
        Apropos Research
      </div>
    }>
      <DynamicHeaderInner />
    </Suspense>
  );
}
