import type { FundingCategory } from '@/lib/funding/types';

export const FUNDING_CATEGORIES: FundingCategory[] = [
  {
    id: 'dk-kultur',
    label: 'Dansk kultur',
    searchSeeds: ['kulturpulje', 'statens kunstfond', 'kulturministeriet tilskud', 'kulturstyrelsen pulje'],
    siteHints: ['site:kum.dk', 'site:kunst.dk', 'site:kulturstyrelsen.dk'],
  },
  {
    id: 'dk-medie-journalistik',
    label: 'Medie & journalistik',
    searchSeeds: ['mediepulje', 'journalistisk fond', 'public service pulje', 'medieunderstøttelse'],
    siteHints: ['site:sl.dk', 'site:medienævnet.dk'],
  },
  {
    id: 'eu-international',
    label: 'EU & international',
    searchSeeds: ['Creative Europe', 'MEDIA programme grant', 'Nordisk Film & TV Fond', 'EU kultur tilskud'],
    siteHints: ['site:eacea.ec.europa.eu', 'site:nordiskfilmogtvfond.com'],
  },
  {
    id: 'private-fonde',
    label: 'Private fonde',
    searchSeeds: ['Realdania fond', 'Novo Nordisk Fonden kultur', 'Nordea-fonden udbud', 'private kulturfond danmark'],
    siteHints: [],
  },
  {
    id: 'regional-kommunal',
    label: 'Regional & kommunal',
    searchSeeds: ['kommunal kulturstøtte', 'region kulturprojekt', 'lokal kulturpulje'],
    siteHints: [],
  },
];
