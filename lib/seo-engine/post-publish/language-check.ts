/** Conservative, deterministic warning/gate, not an AI language certificate.
 * Assess full body only, not Danish proper nouns inside English metadata. */
export function seoLanguageCheck(body: string, locale: 'da' | 'en') {
  const tokens = body.toLowerCase().match(/[a-zæøå]+/g) || [];
  const da = new Set('og ikke på med til hun han men der det at som var blev også havde kunne skulle fra sig være meget noget flere lidt efter hvor'.split(' '));
  const en = new Set('the and not with she he but that was were also had could should from his her their which have would has been this they'.split(' '));
  const matches = tokens.filter(t => da.has(t));
  const mismatch = locale === 'en' && tokens.length >= 100 && new Set(matches).size >= 8 &&
    matches.length >= 30 && matches.length > tokens.filter(t => en.has(t)).length * 4;
  return { status: mismatch ? 'locale_mismatch' as const : 'not_flagged' as const, expectedLocale: locale,
    suspectedContentLanguage: mismatch ? 'da' : null, method: 'conservative_function_word_check',
    nextAction: mismatch ? 'review_translation' : null,
    note: mismatch ? 'Den engelske side indeholder tydeligt dansk brødtekst. Afklar/oversæt hele sprogversionen separat; oversæt ikke kun SEO-felterne. Dansk original, byline og rating skal bevares.'
      : 'Ingen sikker sprogkonflikt fundet af den begrænsede kontrol. ChatGPT skal stadig læse og vurdere hele teksten.' };
}
