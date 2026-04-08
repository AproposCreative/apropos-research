import { Suspense } from 'react';
import AproposAILoadingScreen from '@/components/AproposAILoadingScreen';
import AIWriterClient from './AIWriterClient';

export default function AIPage() {
  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <Suspense fallback={<AproposAILoadingScreen />}>
        <AIWriterClient />
      </Suspense>
    </div>
  );
}
