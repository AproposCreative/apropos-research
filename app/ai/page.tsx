import { Suspense } from 'react';
import AIWriterClient from './AIWriterClient';

export default function AIPage() {
  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <Suspense fallback={
        <div className="flex items-center justify-center h-[100dvh] bg-black text-white/60">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <span className="text-sm">Indlæser AI Writer...</span>
          </div>
        </div>
      }>
        <AIWriterClient />
      </Suspense>
    </div>
  );
}
