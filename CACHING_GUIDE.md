# Caching Implementation Guide

## Overview

Dette projekt implementerer et **2-lags caching system** for at forbedre performance og reducere unødvendige API kald til Webflow:

1. **Server-side cache** (in-memory) - Cacher API responses på serveren
2. **Client-side cache** (React Query) - Cacher data i browseren

## Server-side Caching

### Implementation

Alle Webflow API endpoints bruger nu en simpel in-memory cache:

```typescript
import { apiCache, CACHE_TTL } from '@/lib/cache';

const cacheKey = 'webflow:authors';
const cached = apiCache.get<any>(cacheKey);
if (cached) {
  return NextResponse.json(cached);
}

// Fetch data...
apiCache.set(cacheKey, result, CACHE_TTL.LONG);
```

### Cache TTL (Time To Live)

- **SHORT**: 2 minutter - For data der ændrer sig ofte
- **MEDIUM**: 5 minutter - For semi-statisk data
- **LONG**: 15 minutter - For statisk data (authors, sections, topics)
- **VERY_LONG**: 1 time - For meget statisk data

### Cached Endpoints

Følgende endpoints bruger server-side caching:

- `/api/webflow/authors` - 15 min cache
- `/api/webflow/sections` - 15 min cache
- `/api/webflow/topics` - 15 min cache
- `/api/webflow/article-fields` - 15 min cache
- `/api/webflow/analysis` - 15 min cache
- `/api/webflow/streaming-services` - 15 min cache

### Cache Management

```typescript
import { apiCache } from '@/lib/cache';

// Invalidate specific key
apiCache.invalidate('webflow:authors');

// Invalidate all keys matching pattern
apiCache.invalidatePattern('webflow:.*');

// Clear all cache
apiCache.clear();

// Get cache stats
const stats = apiCache.getStats();
```

## Client-side Caching

### Implementation

React Query bruges til at cache data i browseren og forhindre unødvendige re-fetches:

```typescript
import { useWebflowAuthors } from '@/lib/use-webflow-data';

function MyComponent() {
  const { data: authors, isLoading, error } = useWebflowAuthors();
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return <div>{authors.map(...)}</div>;
}
```

### Available Hooks

- `useWebflowAuthors()` - Fetch authors with caching
- `useWebflowSections()` - Fetch sections with caching
- `useWebflowTopics()` - Fetch topics with caching
- `useWebflowArticleFields()` - Fetch article fields with caching
- `useWebflowAnalysis()` - Fetch analysis with caching
- `useWebflowStreamingServices()` - Fetch streaming services with caching

### React Query Configuration

```typescript
{
  staleTime: 5 * 60 * 1000,           // 5 min (data considered fresh)
  gcTime: 10 * 60 * 1000,             // 10 min (keep in memory)
  retry: 1,                            // Retry once on failure
  refetchOnWindowFocus: false,        // Don't refetch on focus
  refetchOnReconnect: true,           // Refetch on reconnect
}
```

## Performance Benefits

### Before Caching

```
Request #1: GET /api/webflow/authors → 175ms
Request #2: GET /api/webflow/authors → 185ms (duplicate!)
Request #3: GET /api/webflow/authors → 177ms (duplicate!)
Request #4: GET /api/webflow/sections → 364ms
Request #5: GET /api/webflow/sections → 192ms (duplicate!)
```

**Total**: ~1093ms for 5 requests (3 duplicates)

### After Caching

```
Request #1: GET /api/webflow/authors → 175ms (cache miss)
Request #2: GET /api/webflow/authors → <1ms (cache hit! ✅)
Request #3: GET /api/webflow/authors → <1ms (cache hit! ✅)
Request #4: GET /api/webflow/sections → 364ms (cache miss)
Request #5: GET /api/webflow/sections → <1ms (cache hit! ✅)
```

**Total**: ~540ms for 5 requests (50% faster! 🚀)

## Migration Guide

### Old Pattern (Without Caching)

```typescript
const [authors, setAuthors] = useState([]);

useEffect(() => {
  fetch('/api/webflow/authors')
    .then(r => r.json())
    .then(data => setAuthors(data.authors));
}, []);
```

### New Pattern (With Caching)

```typescript
import { useWebflowAuthors } from '@/lib/use-webflow-data';

const { data: authors = [], isLoading } = useWebflowAuthors();
```

**Benefits**:
- ✅ Automatic caching
- ✅ Prevents duplicate requests
- ✅ Loading states handled
- ✅ Error handling included
- ✅ Automatic retries
- ✅ Stale-while-revalidate pattern

## Monitoring

To see cache hits/misses in production, check the response headers or server logs.

Cache hits will return almost instantly (<1ms) while cache misses will take the full API request time (100-500ms).

## Best Practices

1. **Use React Query hooks** for all Webflow data fetching
2. **Don't fetch in useEffect** - use the provided hooks instead
3. **Invalidate cache** when data changes (after POST/PUT/DELETE)
4. **Monitor cache size** - clear old entries if memory becomes an issue
5. **Adjust TTL** based on data update frequency

## Troubleshooting

### Cache not working?

1. Check if endpoint is using `apiCache.get()` and `apiCache.set()`
2. Verify cache key is consistent
3. Check TTL hasn't expired
4. Ensure React Query provider is in layout

### Stale data?

1. Manually invalidate cache: `apiCache.invalidate(key)`
2. Reduce TTL for frequently changing data
3. Use React Query's `refetch()` method

### Memory issues?

1. Reduce TTL values
2. Call `apiCache.clear()` periodically
3. Reduce `gcTime` in React Query config

## Future Improvements

- [ ] Add Redis for persistent caching across server restarts
- [ ] Implement cache warming on server startup
- [ ] Add cache metrics/monitoring dashboard
- [ ] Implement automatic cache invalidation on Webflow webhooks
- [ ] Add per-user cache for personalized data

