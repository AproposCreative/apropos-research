import { URL } from 'url';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'ref', 'source', 'campaign_id',
  'mc_cid', 'mc_eid', '_ga', '_gid'
]);

const DEFAULT_IGNORE_PATHS = [
  '/wp-admin', '/admin', '/login', '/logout', '/account', '/signin',
  '/signout', '/register', '/signup', '/api/', '/_next/', '/static/',
  '/assets/', '/css/', '/js/', '/img/', '/images/', '/fonts/'
];

export function normalizeUrl(url: string, stripTracking: boolean = true): string {
  try {
    const parsed = new URL(url);
    
    // Remove fragment
    parsed.hash = '';
    
    // Normalize trailing slash (remove for consistency)
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    
    // Strip tracking parameters
    if (stripTracking) {
      for (const param of TRACKING_PARAMS) {
        parsed.searchParams.delete(param);
      }
    }
    
    // Normalize protocol (https preferred)
    parsed.protocol = 'https:';
    
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();
    
    return parsed.toString();
  } catch {
    return url;
  }
}

export function getOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return '';
  }
}

export function isSameOrigin(url: string, origin: string, includeSubdomains: boolean = false): boolean {
  try {
    const urlOrigin = getOrigin(url);
    if (urlOrigin === origin) return true;
    
    if (includeSubdomains) {
      const originHost = new URL(origin).hostname;
      const urlHost = new URL(url).hostname;
      
      // Check if urlHost is a subdomain of originHost
      return urlHost === originHost || urlHost.endsWith('.' + originHost);
    }
    
    return false;
  } catch {
    return false;
  }
}

export function shouldIgnoreUrl(url: string, ignorePaths: string[] = []): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    
    const allIgnorePaths = [...DEFAULT_IGNORE_PATHS, ...ignorePaths];
    
    for (const ignorePath of allIgnorePaths) {
      if (path.startsWith(ignorePath.toLowerCase())) {
        return true;
      }
    }
    
    // Check for binary file extensions
    const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
      '.mp4', '.mp3', '.avi', '.mov', '.zip', '.tar', '.gz', '.pdf'];
    
    const extension = path.substring(path.lastIndexOf('.')).toLowerCase();
    if (binaryExtensions.includes(extension)) {
      return true;
    }
    
    return false;
  } catch {
    return true;
  }
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Normalize and validate URL, automatically adding https:// if no protocol is provided
 */
export function normalizeAndValidateUrl(url: string): { valid: boolean; normalized: string } {
  // Trim whitespace
  const trimmed = url.trim();
  
  if (!trimmed) {
    return { valid: false, normalized: trimmed };
  }
  
  // If URL already has protocol, validate it
  if (trimmed.match(/^https?:\/\//i)) {
    return { valid: isValidUrl(trimmed), normalized: trimmed };
  }
  
  // Auto-add https:// if no protocol
  const withProtocol = `https://${trimmed}`;
  return { valid: isValidUrl(withProtocol), normalized: withProtocol };
}

export function getCanonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}
