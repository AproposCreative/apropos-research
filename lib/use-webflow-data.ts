'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Custom hooks for fetching Webflow data with automatic caching
 * Uses React Query to prevent unnecessary API calls
 */

async function fetchWebflowData<T>(endpoint: string): Promise<T> {
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}`);
  }
  return res.json();
}

/**
 * Fetch Webflow authors with caching
 * Cached for 15 minutes
 */
export function useWebflowAuthors() {
  return useQuery({
    queryKey: ['webflow', 'authors'],
    queryFn: () => fetchWebflowData<{ authors: any[] }>('/api/webflow/authors'),
    staleTime: 15 * 60 * 1000, // 15 minutes
    select: (data) => data.authors || [],
  });
}

/**
 * Fetch Webflow sections with caching
 * Cached for 15 minutes
 */
export function useWebflowSections() {
  return useQuery({
    queryKey: ['webflow', 'sections'],
    queryFn: () => fetchWebflowData<{ items: any[] }>('/api/webflow/sections'),
    staleTime: 15 * 60 * 1000,
    select: (data) => data.items || [],
  });
}

/**
 * Fetch Webflow topics with caching
 * Cached for 15 minutes
 */
export function useWebflowTopics() {
  return useQuery({
    queryKey: ['webflow', 'topics'],
    queryFn: () => fetchWebflowData<{ items: any[] }>('/api/webflow/topics'),
    staleTime: 15 * 60 * 1000,
    select: (data) => data.items || [],
  });
}

/**
 * Fetch Webflow article fields with caching
 * Cached for 15 minutes
 */
export function useWebflowArticleFields() {
  return useQuery({
    queryKey: ['webflow', 'article-fields'],
    queryFn: () => fetchWebflowData<{ fields: any[] }>('/api/webflow/article-fields'),
    staleTime: 15 * 60 * 1000,
    select: (data) => data.fields || [],
  });
}

/**
 * Fetch Webflow analysis with caching
 * Cached for 15 minutes
 */
export function useWebflowAnalysis() {
  return useQuery({
    queryKey: ['webflow', 'analysis'],
    queryFn: () => fetchWebflowData<{ guidance: any[] }>('/api/webflow/analysis'),
    staleTime: 15 * 60 * 1000,
    select: (data) => data.guidance || [],
  });
}

/**
 * Fetch Webflow streaming services with caching
 * Cached for 15 minutes
 */
export function useWebflowStreamingServices() {
  return useQuery({
    queryKey: ['webflow', 'streaming-services'],
    queryFn: () => fetchWebflowData<{ items: any[] }>('/api/webflow/streaming-services'),
    staleTime: 15 * 60 * 1000,
    select: (data) => data.items || [],
  });
}

