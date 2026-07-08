import { normalizeFundingText } from '@/lib/funding/normalize';

export const APROPOS_FUNDING_PROFILE = {
  organization:
    'Apropos Magazine — digitalt kulturmagasin med fokus på musik, film/TV, gaming og bred kulturjournalistik.',
  purpose: 'Publicistisk og journalistisk indhold; ikke kommerciel produktion eller ren event-sponsorering.',
  geography: 'Danmark og nordisk kontekst; EU-puljer når projektet har dansk/nordisk forankring.',
  exclusions: [
    'Ren hardware/infrastruktur uden journalistisk vinkel',
    'Kommercielle events uden redaktionelt/publicistisk formål',
    'Generel virksomhedsdrift uden kultur-/medieprojekt',
  ],
};

const FIT_KEYWORDS =
  /kultur|medie|journalist|magasin|publicist|digitalt indhold|kunst|musik|film|gaming|spil|dokumentar|kreativ/i;

const EXCLUDE_KEYWORDS = /hardware only|ren event|sponsorering uden|kommerciel produktion uden journalist/i;

export function computeFitScore(text: string): number {
  const normalized = normalizeFundingText(text);
  let score = 45;
  if (FIT_KEYWORDS.test(normalized)) score += 28;
  if (/danmark|dansk|nordisk|eu creative/i.test(normalized)) score += 12;
  if (/magasin|medie|journalist|publicist/i.test(normalized)) score += 10;
  if (EXCLUDE_KEYWORDS.test(normalized)) score -= 25;
  return Math.max(15, Math.min(95, Math.round(score)));
}

export function buildEligibilityMatchSummary(text: string): { match: string; gaps: string[] } {
  const fit = computeFitScore(text);
  const gaps: string[] = [];
  if (fit < 55) gaps.push('Svag match til Apropos-profil — verificér om puljen dækker digitalt kulturmagasin.');
  if (!/journalist|medie|kultur|publicist/i.test(text)) {
    gaps.push('Eligibility-tekst nævner ikke tydeligt medie/kultur/journalistik.');
  }
  if (!/danmark|dansk|nordisk|eu/i.test(text)) {
    gaps.push('Geografisk forankring (DK/nordisk/EU) er uklar i kilderne.');
  }
  const match =
    fit >= 70
      ? 'God match: puljen passer sandsynligvis til Apropos som kultur-/medieprojekt.'
      : fit >= 55
        ? 'Moderat match: mulig, men kræver manuel vurdering af officielle vilkår.'
        : 'Svag match: overvej om ansøgning er relevant før tidsforbrug.';
  return { match, gaps };
}
