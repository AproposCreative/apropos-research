import { Suspense } from 'react';
import PromptArchitectClient from './PromptArchitectClient';

export default function PromptArchitectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-black text-white/50 flex items-center justify-center text-sm">
          Indlæser Prompt Architect…
        </div>
      }
    >
      <PromptArchitectClient />
    </Suspense>
  );
}
