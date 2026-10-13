import { MCP_ORIGIN } from './config';

/** Shared with the isolated CSP browser fixture; no direct widget API access. */
export const ARTICLE_WIDGET_CSP = {
  connectDomains: [],
  resourceDomains: [MCP_ORIGIN, 'https://cdn.prod.website-files.com',
    'https://uploads-ssl.webflow.com', 'https://assets-global.website-files.com'],
};
