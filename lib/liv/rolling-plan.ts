import type { LivDailyPlan } from '@/lib/liv/daily-plan-store';
import { addDays, LIV_PLAN_DAYS, LIV_RESERVE_TARGET, type DeliveryState } from '@/lib/liv/delivery-policy';
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
  return { dayKey: day, topicHint: questions[index],
    directiveHint: 'Skriv en selvstændig dansk kulturfeature i Livs Apropos-stemme. Besvar spørgsmålet med ' +
      'konkrete, kildebelagte værker eller eksempler, kulturel fortolkning, modargument og en tydelig egen tese. ' +
      'Ingen opdigtede oplevelser, interviews, aktuelle begivenheder eller anmeldelsesstjerner. ' +
      'Undgå genbrug af nyligt dækkede vinkler. ' +
      (reserve ? 'Tidløs reserve: ingen snart udløbende arrangementer, relative datoer som i morgen eller udokumenterede besøg.' :
        'Faktatjek aktualitet til den planlagte udgivelsesdato, ikke alene produktionsdagen.'),
    articleFormat: 'article', mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null };
}

/** One bounded generation per invocation. Tomorrow first, then reserves, then the week. */
export function preparationCandidates(state: DeliveryState, today: string) {
  const dates = Array.from({ length: LIV_PLAN_DAYS }, (_, i) => addDays(today, i + 1));
  const scheduled = dates.filter(day => !state.entries.some(e => e.kind === 'scheduled' &&
    e.decision !== 'rejected' && ['ready', 'selected', 'published'].includes(e.state) && e.scheduledDay === day))
    .map(dayKey => ({ dayKey, kind: 'scheduled' as const }));
  const count = state.entries.filter(e => e.kind === 'reserve' && e.state === 'ready' && e.decision !== 'rejected' &&
    e.scheduledDay <= today && e.expiresDay >= today).length;
  const reserves = count >= LIV_RESERVE_TARGET ? [] : Array.from({ length: LIV_RESERVE_TARGET }, (_, i) =>
    ({ dayKey: addDays(today, i), kind: 'reserve' as const }));
  const tomorrow = scheduled.filter(p => p.dayKey === dates[0]);
  return [...tomorrow, ...reserves, ...scheduled.filter(p => p.dayKey !== dates[0])];
}
