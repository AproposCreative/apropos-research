import { Suspense } from 'react';
import AproposAILoadingScreen from '@/components/AproposAILoadingScreen';
import PromptArchitectClient from './PromptArchitectClient';

export default function PromptArchitectPage() {
  return (
    <Suspense fallback={<AproposAILoadingScreen />}>
      <PromptArchitectClient />
    </Suspense>
  );
}
