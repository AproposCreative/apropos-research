export const APROPOS_PUBLIC_ORIGIN = 'https://www.aproposmagazine.com';
export const APROPOS_ORGANIZATION_ID = `${APROPOS_PUBLIC_ORIGIN}/#organization`;
export const APROPOS_WEBSITE_ID = `${APROPOS_PUBLIC_ORIGIN}/#website`;
export const APROPOS_ORGANIZATION_NAME = 'Apropos Magazine';

export function pageEntityId(pageUrl: string): string {
  return `${pageUrl.replace(/#.*$/, '')}#webpage`;
}

export function articleEntityId(pageUrl: string): string {
  return `${pageUrl.replace(/#.*$/, '')}#article`;
}
