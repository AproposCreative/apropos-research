'use client';

interface ShimmerProps {
  className?: string;
  children?: React.ReactNode;
}

export default function Shimmer({ className = '', children }: ShimmerProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {children}
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/10" />
    </div>
  );
}

// Shimmer skeleton components for common use cases
export function ShimmerCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card-base card-light dark:card-glass h-full ${className}`}>
      <Shimmer className="aspect-[16/9] bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800" />
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <Shimmer className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
          <Shimmer className="h-4 w-16 bg-slate-200 dark:bg-slate-700" />
        </div>
        <Shimmer className="h-6 w-full mb-2 bg-slate-200 dark:bg-slate-700" />
        <Shimmer className="h-6 w-3/4 mb-3 bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1" />
        <div className="flex items-center justify-between mt-4">
          <Shimmer className="h-8 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
          <Shimmer className="h-4 w-32 bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  );
}

export function ShimmerGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ShimmerCard key={i} />
      ))}
    </div>
  );
}

export function ShimmerText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer 
          key={i} 
          className={`h-4 bg-slate-200 dark:bg-slate-700 ${
            i === lines - 1 ? 'w-3/4' : 'w-full'
          }`} 
        />
      ))}
    </div>
  );
}

export function ShimmerButton({ className = '' }: { className?: string }) {
  return (
    <Shimmer className={`h-10 w-24 rounded-xl bg-slate-200 dark:bg-slate-700 ${className}`} />
  );
}

export function ShimmerHeader({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      <Shimmer className="h-8 w-64 bg-slate-200 dark:bg-slate-700" />
      <Shimmer className="h-4 w-48 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}
