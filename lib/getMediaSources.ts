import fs from 'fs';
import path from 'path';

interface MediaSource {
  id: string;
  name: string;
  baseUrl: string;
  sitemapIndex: string;
  enabled: boolean;
  addedAt: string;
}

const MEDIA_SOURCES_FILE = path.join(process.cwd(), 'data', 'media-sources.json');

// Default media sources
const defaultMediaSources: MediaSource[] = [
  {
    id: 'soundvenue',
    name: 'Soundvenue',
    baseUrl: 'https://soundvenue.com',
    sitemapIndex: '/sitemap.xml',
    enabled: true,
    addedAt: new Date().toISOString()
  },
  {
    id: 'gaffa',
    name: 'GAFFA',
    baseUrl: 'https://gaffa.dk',
    sitemapIndex: '/sitemap',
    enabled: true,
    addedAt: new Date().toISOString()
  },
  {
    id: 'berlingske',
    name: 'BERLINGSKE',
    baseUrl: 'https://www.berlingske.dk',
    sitemapIndex: '/sitemap.xml/news',
    enabled: true,
    addedAt: new Date().toISOString()
  },
  {
    id: 'bt',
    name: 'BT',
    baseUrl: 'https://www.bt.dk',
    sitemapIndex: '/sitemap.xml/news',
    enabled: true,
    addedAt: new Date().toISOString()
  }
];

export function getMediaSources(): MediaSource[] {
  try {
    if (fs.existsSync(MEDIA_SOURCES_FILE)) {
      const data = fs.readFileSync(MEDIA_SOURCES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading media sources:', error);
  }
  return defaultMediaSources;
}
