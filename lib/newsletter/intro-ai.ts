import { env } from '@/lib/config/env';
import { getOpenAIClient } from '@/lib/openai';
import type { NewsletterArticle } from '@/lib/newsletter/webflow-sources';
import type { WeekRange } from '@/lib/newsletter/week-range';

const MAX_EXCERPT_CHARS = 120;
const MAX_ARTICLES_IN_PROMPT = 8;

/** Ingen tankestreger (— / –) i udgående brødtekst: redaktionelt valg for nyhedsbrev. */
export function stripTypographicDashesForNewsletter(s: string): string {
  return s
    .replace(/\u2014/g, ', ')
    .replace(/\u2013/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .trim();
}

function excerptSnippet(excerpt: string): string {
  const t = excerpt.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length > MAX_EXCERPT_CHARS ? `${t.slice(0, MAX_EXCERPT_CHARS)}…` : t;
}

function parseHeadlineIntroJson(raw: string): { headline: string; intro: string } {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```[\s\n]*$/i, '');
  }
  const j = JSON.parse(t) as { headline?: unknown; intro?: unknown };
  const headline = typeof j.headline === 'string' ? j.headline.trim() : '';
  const intro = typeof j.intro === 'string' ? j.intro.trim() : '';
  return { headline, intro };
}

export async function generateNewsletterIntro(
  week: WeekRange,
  articles: NewsletterArticle[]
): Promise<{ headline: string; intro: string; error?: string }> {
  const client = getOpenAIClient();
  if (!client) {
    return { headline: '', intro: '', error: 'OPENAI_API_KEY mangler' };
  }
  const slice = articles.slice(0, MAX_ARTICLES_IN_PROMPT);
  const articleLines = slice.map((a) => {
    const ex = excerptSnippet(a.excerpt);
    return ex ? `* ${a.title}\n  Uddrag: ${ex}` : `* ${a.title}`;
  });
  const titlesBlock = articleLines.length
    ? articleLines.join('\n')
    : '(ingen artikler: skriv alligevel en kort, generisk velkomst)';

  const user = [
    `Vi sender et nyhedsbrev for Apropos Magazine.`,
    `Publiceringsperiode som udgangspunkt for udvalget: ${week.labelDa}.`,
    `Antal artikler på listen (ifølge kilden): ${articles.length}.`,
    `Artikler (maks. ${MAX_ARTICLES_IN_PROMPT} vist til kontekst):`,
    titlesBlock,
    ``,
    `Svar KUN med gyldig JSON med nøjagtigt disse nøgler: "headline" og "intro".`,
    `"headline": Én kort redaktionel overskrift (maks. ca. 8 ord), på dansk. Den skal fange spændvidden i udvalget: væv gerne flere temaer eller spor fra listen sammen (fx serie, scene, kultur), så læseren mærker hele ugens mix. Undgå den generiske frase "Ugens udvalg".`,
    `OVERSKRIFT: Undgå at én person eller ét navn "dominerer" eller "fylder mest" i overskriften, medmindre mailen reelt kun handler om én artikel. Ingen formuleringer som "[Navn] fylder mest", "X dominerer ugen" eller rene portræt-overskrifter hvis der er flere tydelige emner i listen.`,
    `"intro": To eller tre korte afsnit på dansk (adskil med \\n\\n): varm, skarp, lidt ironisk, i tråd med magasinet ("for dem der følger med før det bliver moderne").`,
    `Opsummér hvad der er sket på Apropos ud fra titlerne og uddragene (temaer, spredning af emner hvis det giver mening).`,
    `RÆKKEFØLGE I BRØDTEXT: Den første artikel på listen er den nyeste (også det store billede øverst). Giv den naturligt mest plads i introen, men nævn også andre artikler og stemninger så mailen føles som et samlet udvalg. Den anden artikel er næstnyeste. De øvrige er ældre: giv dem mindre plads (højst en kort sætning tilsammen).`,
    `TEGN: Brug ALDRIG lang tankestreg (Unicode 2014) eller kort tankestreg (Unicode 2013) i "headline" eller "intro". Brug komma, punktum, semikolon eller "og" i stedet.`,
    `VIGTIGT: Skriv ikke om "mest læste", hitlister, læsertal eller rangering. Vi har ikke den data. Undgå enhver påstand om popularitet eller antal læsere.`,
    `Undgå ugenummer og formuleringer som "uge 14". Du må gerne slutte med en kort sætning om at listen nedenfor samler udvalget, uden at stille et spørgsmål til læseren.`,
    `Ingen emojis. Ingen bullet points i intro. Ingen "Kære læser". Afslut ikke med et spørgsmål til læseren.`,
    `I "intro": kun brødtekst. Gentag ikke overskriften som første linje.`,
  ].join('\n');

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.85,
      max_completion_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Du er chefrédaktør for Apropos Magazine. Du skriver korte, redaktionelle overskrifter og intros til et nyhedsbrev. Overskriften skal afspejle hele udvalgets bredde hvor det er muligt, ikke ét navn som ene-stjerne. I brødteksten prioriteres den nyeste artikel først, men de andre temaer skal også føles med. Brug aldrig tankestreg (em dash eller en dash) i output. Hold dig til dansk. Opfind ikke artikler, tal eller læsertal som ikke er givet i konteksten. Du svarer altid med et JSON-objekt med nøglerne "headline" og "intro".',
        },
        { role: 'user', content: user },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() || '';
    if (!raw) return { headline: '', intro: '', error: 'Tomt svar fra modellen' };
    let headline = '';
    let intro = '';
    try {
      const parsed = parseHeadlineIntroJson(raw);
      headline = stripTypographicDashesForNewsletter(parsed.headline).slice(0, 140);
      intro = stripTypographicDashesForNewsletter(parsed.intro);
    } catch {
      return { headline: '', intro: '', error: 'Kunne ikke læse AI-svar (JSON)' };
    }
    if (!intro) return { headline: '', intro: '', error: 'Modellen returnerede ingen intro-tekst' };
    return { headline, intro };
  } catch (e) {
    return { headline: '', intro: '', error: e instanceof Error ? e.message : 'OpenAI-fejl' };
  }
}
