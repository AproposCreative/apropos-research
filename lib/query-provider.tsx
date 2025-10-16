'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * React Query provider for client-side caching
 * Prevents unnecessary API calls and improves performance
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache queries for 5 minutes by default
            staleTime: 5 * 60 * 1000,
            // Keep unused queries in cache for 10 minutes
            gcTime: 10 * 60 * 1000,
            // Retry failed queries once
            retry: 1,
            // Don't refetch on window focus (can be annoying)
            refetchOnWindowFocus: false,
            // Refetch on reconnect
            refetchOnReconnect: true,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

