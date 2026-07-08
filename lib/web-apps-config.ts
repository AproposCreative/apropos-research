/**
 * Web-apps launcher config.
 * Apps listed here appear in the grid menu; admin can add icon URLs later (e.g. upload to storage).
 */
export interface WebAppEntry {
  id: string;
  name: string;
  path: string;
  /** Icon URL – e.g. /images/web-apps/ai-writer.svg or external URL. Admin-uploaded later. */
  iconUrl?: string;
  order: number;
}

export const WEB_APPS: WebAppEntry[] = [
  { id: 'ai-writer', name: 'AI Writer', path: '/ai', order: 1 },
  { id: 'design-editor', name: 'SoMe Posting', path: '/design-editor', order: 2 },
  { id: 'newsletter', name: 'Nyhedsbrev', path: '/ai?view=newsletter', order: 3 },
  { id: 'push-desk', name: 'Push', path: '/ai?view=push', order: 4 },
  { id: 'funding-desk', name: 'Funding Desk', path: '/ai?view=funding', order: 5 },
  { id: 'dashboard', name: 'Dashboard', path: '/ai?view=dashboard', order: 6 },
  { id: 'podcast', name: 'Podcast Upload', path: '/ai?view=podcast', order: 7 },
];

export function getWebApps(): WebAppEntry[] {
  return [...WEB_APPS].sort((a, b) => a.order - b.order);
}
