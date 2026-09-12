import type { LivDailyPlan } from '@/lib/liv/daily-plan-store';
import { addDays, eligibleEntries, type DeliveryState } from '@/lib/liv/delivery-policy';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

export function editorialPlanHash(plan: LivDailyPlan | null) {
  return cmsFieldHash({ topicHint: plan?.topicHint || '', directiveHint: plan?.directiveHint || '',
    expandedDirective: plan?.expandedDirective || '', articleFormat: plan?.articleFormat || 'article',
    mustUseTrending: plan?.mustUseTrending ?? true });
}

// Editorial questions, not assertions or invented current events. The existing
// research pipeline must substantiate concrete examples before anything is ready.
const QUESTIONS = [
  'Hvad sker der med Københavns musikliv, når små spillesteder forsvinder?',
  'Hvornår bliver kunst i byrummet et fælles rum, og hvornår bliver den blot en selfie-kulisse?',
  'Hvorfor fylder venskaber så meget i de tv-serier, vi taler om?',
  'Hvem får lov at være med, når en koncert bliver et statussymbol?',
  'Hvordan former klubkultur måden, vi klæder os og finder fællesskab på?',
  'Hvad kan biografens fælles oplevelse, som sofaens streaming ikke kan?',
  'Hvorfor vender unge musikere tilbage til gamle lyde og analoge formater?',
  'Hvordan påvirker algoritmer, hvilken ny dansk musik vi opdager?',
  'Hvem bestemmer, hvad der er god smag i København?',
  'Hvordan skaber queer-kunst nye billeder af kærlighed og tilhørsforhold?',
  'Hvorfor bliver kulturens skurke nogle gange vores yndlingsfigurer?',
  'Hvad betyder det for en by, at der findes gratis kultur?',
  'Hvor går grænsen mellem en kunstners persona og det værk, vi møder?',
  'Hvad mister vi, når musik kun bliver et kort klip i vores feed?',
];
const RESERVE_QUESTIONS = [
  'Hvorfor er det så svært at beskrive musik uden at tale om noget andet?',
  'Hvad fortæller vores koncert-T-shirts om identitet og tilhørsforhold?',
  'Hvordan bliver et albumcover en del af den musik, vi husker?',
  'Hvorfor kan en velvalgt filmsang ændre en hel scenes betydning?',
  'Hvad sker der, når vi læser en roman gennem dens filmatisering?',
  'Hvorfor har subkulturer brug for steder at mødes fysisk?',
  'Hvad gør en kunstnerisk genfortolkning til mere end en kopi?',
  'Hvilken rolle spiller tavshed i film og musik?',
  'Hvorfor bliver nogle kulturværker interessante igen, når tiden ændrer sig?',
  'Hvordan kan et kostume fortælle noget, en filmfigur aldrig siger højt?',
  'Hvorfor er det vigtigt, at kultur også kan gøre os uenige?',
  'Hvad kan en lokal musikscene, som en global hitliste ikke kan?',
  'Hvordan former rummets arkitektur vores møde med et kunstværk?',
  'Hvorfor bliver pladesamlinger og bogreoler til selvportrætter?',
];
export function defaultEditorialPlan(day: string, reserve = false): LivDailyPlan {
  const questions = reserve ? RESERVE_QUESTIONS : QUESTIONS;
  const index = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000) % questions.length;
  // The question is an editorial lens, not a literal topic. Keeping it out of
  // topicHint lets the picker choose a concrete, current source-backed story;
  // the old behavior often turned the question into a synthetic topic with no
  // usable evidence, leaving the weekly feed empty.
  return { dayKey: day,
    directiveHint: `Skriv selvstændig dansk kulturjournalistik i Livs Apropos-stemme. Brug dette redaktionelle spørgsmål som mulig vinkel, ikke som et påtvunget format; lad det konkrete værk være hovedsagen, når det skal vurderes: ${questions[index]} ` +
      'Besvar spørgsmålet med ' +
      'konkrete, kildebelagte værker eller eksempler, kulturel fortolkning, modargument og en tydelig egen tese. ' +
      'Ingen opdigtede oplevelser, citater eller aktuelle begivenheder. En eventuel karakter skal begrundes i dokumenterede styrker og svagheder, aldrig vælges tilfældigt. ' +
      'Undgå genbrug af nyligt dækkede vinkler. ' +
      (reserve ? 'Tidløs reserve: ingen snart udløbende arrangementer, relative datoer som i morgen eller udokumenterede besøg.' :
        'Faktatjek aktualitet til den planlagte udgivelsesdato, ikke alene produktionsdagen.'),
    ...(reserve ? { articleFormat: 'article' as const } : {}), mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null };
}

/** One article in production at a time. Keep old inventory and paid jobs intact.
 * An explicit rejection permits one alternative in a separate durable job, never
 * a reset of the rejected article or an unbounded stream of replacements. */
export function preparationCandidates(state: DeliveryState, today: string) {
  if (state.coverRevision || Object.values(state.slots).some(slot => slot.state === 'attempted')) return [];
  const dayKey = !state.slots[today] && eligibleEntries(state, today).length === 0 ? today : addDays(today, 1);
  if (state.slots[dayKey] || state.entries.some(e => e.kind === 'scheduled' && e.scheduledDay === dayKey &&
      e.expiresDay >= dayKey && e.decision !== 'rejected' && ['ready', 'selected', 'published'].includes(e.state))) return [];
  const rejected = state.entries.filter(e => e.kind === 'scheduled' && e.scheduledDay === dayKey &&
    e.decision === 'rejected');
  if (rejected.length >= 2) return [];
  return [{ dayKey, kind: 'scheduled' as const,
    ...(rejected.length ? { scope: 'prepare-alternative' as const } : {}) }];
}
