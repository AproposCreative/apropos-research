import type { ApplicationSection, ApplicationSectionOption } from '@/lib/funding/types';

export const APPLICATION_SECTION_OPTIONS: ApplicationSectionOption[] = [
  {
    id: 'project',
    label: 'Projektbeskrivelse',
    description: 'Formål, aktiviteter og leverancer for Apropos',
  },
  {
    id: 'impact',
    label: 'Impact & publikum',
    description: 'Effekt, rækkevidde og kulturjournalistisk værdi',
  },
  {
    id: 'budget',
    label: 'Budget',
    description: 'Økonomi, poster og medfinansiering',
  },
  {
    id: 'full',
    label: 'Fuld ansøgning',
    description: 'Samlet udkast med alle sektioner',
  },
];

export function getApplicationSectionOption(id?: ApplicationSection): ApplicationSectionOption {
  return APPLICATION_SECTION_OPTIONS.find((o) => o.id === id) || APPLICATION_SECTION_OPTIONS[3];
}
