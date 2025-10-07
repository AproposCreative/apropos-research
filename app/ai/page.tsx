import { Suspense } from 'react';
import AIWriterClient from './AIWriterClient';

export default function AIPage() {
  return (
    <div className="min-h-screen bg-black">
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-white">Loading AI Writer...</div>}>
        <AIWriterClient />
      </Suspense>
    </div>
  );
}
