import OpenAI from 'openai';
import { env } from '@/lib/config/env';
import type { NewsletterArticle } from '@/lib/newsletter/webflow-sources';
import type { WeekRange } from '@/lib/newsletter/week-range';

const MAX_EXCERPT_CHARS = 120;
const MAX_ARTICLES_IN_PROMPT = 8;

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
  if (!env.OPENAI_API_KEY) {
    return { headline: '', intro: '', error: 'OPENAI_API_KEY mangler' };
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const slice = articles.slice(0, MAX_ARTICLES_IN_PROMPT);
  const articleLines = slice.map((a) => {
    const ex = excerptSnippet(a.excerpt);
    return ex ? `– ${a.title}\n  Uddrag: ${ex}` : `– ${a.title}`;
  });
  const titlesBlock = articleLines.length ? articleLines.join('\n') : '(ingen artikler — skriv alligevel en kort, generisk velkomst)';

  const user = [
    `Vi sender et nyhedsbrev for Apropos Magazine.`,
    `Publiceringsperiode som udgangspunkt for udvalget: ${week.labelDa}.`,
    `Antal artikler på listen (ifølge kilden): ${articles.length}.`,
    `Artikler (maks. ${MAX_ARTICLES_IN_PROMPT} vist til kontekst):`,
    titlesBlock,
    ``,
    `Svar KUN med gyldig JSON med nøjagtigt disse nøgler: "headline" og "intro".`,
    `"headline": Én kort redaktionel overskrift til mailen (maks. ca. 8 ord), på dansk, skarp og konkret ud fra artiklerne — ikke den generiske frase "Ugens udvalg".`,
    `"intro": 2–3 korte afsnit på dansk (adskil med \\n\\n): varm, skarp, lidt ironisk — i tråd med magasinet ("for dem der følger med før det bliver moderne").`,
    `Opsummér hvad der er sket på Apropos ud fra titlerne/uddragene (temaer, spredning af emner hvis det giver mening).`,
    `VIGTIGT: Skriv ikke om "mest læste", hitlister, læsertal eller rangering — vi har ikke den data endnu. Undgå enhver påstand om popularitet eller antal læsere.`,
    `Undgå ugenummer og formuleringer som "uge 14". Du må gerne slutte med en kort sætning om at listen nedenfor samler udvalget — uden at stille et spørgsmål til læseren.`,
    `Ingen emojis. Ingen bullet points i intro. Ingen "Kære læser". Afslut ikke med et spørgsmål til læseren.`,
    `I "intro": kun brødtekst — gentag ikke overskriften som første linje.`,
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
            'Du er chefrédaktør for Apropos Magazine. Du skriver korte, redaktionelle overskrifter og intros til et nyhedsbrev. Hold dig til dansk. Opfind ikke artikler, tal eller læsertal som ikke er givet i konteksten. Du svarer altid med et JSON-objekt med nøglerne "headline" og "intro".',
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
      headline = parsed.headline.slice(0, 140);
      intro = parsed.intro;
    } catch {
      return { headline: '', intro: '', error: 'Kunne ikke læse AI-svar (JSON)' };
    }
    if (!intro) return { headline: '', intro: '', error: 'Modellen returnerede ingen intro-tekst' };
    return { headline, intro };
  } catch (e) {
    return { headline: '', intro: '', error: e instanceof Error ? e.message : 'OpenAI-fejl' };
  }
}
