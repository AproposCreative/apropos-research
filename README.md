## Onkel Ragekniv – Ingestion & Prompt Builder

This tool discovers recent articles, fetches and parses content, then builds summaries, bullets, and chunked text for internal prompt workflows.

### How it works
- Discovery: RSS/Atom feed first, sitemap fallback
- Fetch: rate-limited with retries, conditional ETag/Last-Modified
- Parse: robust selectors for title/author/date/body, HTML cleanup
- Promptize: summary, 3 bullets, and chunks for long bodies
- Store: JSONL outputs for articles and prompts

### Run locally
```bash
npm run ingest:rage -- --since=24 --limit=20
```

### .env example
```
RAGE_BASE_URL=https://example.com
RAGE_FEED_PATH=/feed/
RAGE_SITEMAP_INDEX=/wp-sitemap.xml
RAGE_RATE_LIMIT_RPS=1
RAGE_STORAGE_DIR=./data
RAGE_USER_AGENT=OnkelRageknivBot/0.1 (+kontaktmail)
```

### Ethics & safeguards
- Respects robots.txt (configurable no-robots for testing)
- Low rate-limit (default 1 rps) and exponential backoff
- Intended for internal research/prompting; do not re-publish full text


