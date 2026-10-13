/**
 * Web-apps launcher config.
 * Shared catalogue. Hiding an entry never deletes data or disables its service.
 */
export interface WebAppEntry {
  id: string;
  name: string;
  path: string;
  description: string;
  external?: boolean;
  order: number;
}

export const WEB_APPS: WebAppEntry[] = [
  { id: 'chatgpt-editorial', name: 'Redaktionen i ChatGPT', path: 'https://chatgpt.com/c/6acb2584-2f20-83eb-a335-031a584b8d3b', external: true, description: 'Udvikl idéer, skriv historier og fortsæt arbejdet i din redaktionstråd.', order: 1 },
  { id: 'liv-desk', name: 'Redaktion & godkendelse', path: '/ai?view=liv', description: 'Læs kladder med tekst og billeder. Godkend den version, der skal udgives.', order: 2 },
  { id: 'liv-inbox', name: 'Livs indbakke', path: '/ai?view=liv-inbox', description: 'Læs henvendelser, gennemgå gemte svarforslag og godkend svar.', order: 3 },
  { id: 'design-editor', name: 'Sociale medier', path: '/design-editor', description: 'Gør artikler klar som opslag og stories. Underteksten tilpasses automatisk.', order: 4 },
  { id: 'seo-engine', name: 'SEO & Google', path: '/ai?view=seo', description: 'Følg søgetrafik og gennemgå gemte forslag til titler og beskrivelser.', order: 5 },
  { id: 'newsletter', name: 'Nyhedsbrev', path: '/ai?view=newsletter', description: 'Saml artikler, gennemse nyhedsbrevet og følg ugens udsendelse.', order: 6 },
  { id: 'push-desk', name: 'Pushbeskeder', path: '/ai?view=push', description: 'Skriv beskeder til magasinets app og se tidligere udsendelser.', order: 7 },
  { id: 'podcast', name: 'Podcast', path: '/ai?view=podcast', description: 'Upload lyd, og administrer magasinets podcastepisoder.', order: 8 },
  { id: 'dashboard', name: 'Trafik & overblik', path: '/ai?view=dashboard', description: 'Se læsertal, trafik og magasinets overordnede resultater.', order: 9 },
  { id: 'ai-writer', name: 'AI Writer', path: '/ai?view=ai', description: 'Det tidligere API-baserede skriveværktøj. Gemte arbejdsrum bevares.', order: 10 },
  { id: 'image-gen', name: 'Image-gen', path: '/ai/image-gen', description: 'Det separate API-billedværksted med eget budget og billedarkiv.', order: 11 },
  { id: 'akkreditering', name: 'Akkreditering', path: '/ai?view=akkreditering', description: 'Følg akkrediteringer og gemte henvendelser. Afsendelse styres separat.', order: 12 },
];

export function getWebApps(): WebAppEntry[] {
  return [...WEB_APPS].sort((a, b) => a.order - b.order);
}
