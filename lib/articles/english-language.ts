import { load } from 'cheerio';

const DANISH = new Set('og ikke på med til hun han men der det at som var blev også havde kunne skulle fra sig være meget noget flere lidt efter hvor den et sine sådan når skal deres fordi man endnu af jeg vi dem sine jeres du kan selv'.split(' '));
const ENGLISH = new Set('the and not with she he but that was were also had could should from his her their which have would has been this they is are there as be to an of in for them will its more can if than into by what while after who you we it'.split(' '));

export function articleVisibleText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const $ = load(value);
  $('script,style,iframe').remove();
  $('p,li,div,br,h1,h2,h3,h4,figcaption').after(' ');
  return $.root().text().replace(/\s+/g, ' ').trim();
}

export function looksDanish(value: string): boolean {
  const words = value.toLowerCase().match(/[a-zæøå]+/g) ?? [];
  const danish = words.filter(word => DANISH.has(word));
  const english = words.filter(word => ENGLISH.has(word));
  return danish.length >= 8 && new Set(danish).size >= 5 && danish.length > english.length * 3;
}

export function isDanishArticleCopy(danish: Record<string, unknown>, english: Record<string, unknown>): boolean {
  const original = articleVisibleText(danish.content || danish['post-body']);
  const localized = articleVisibleText(english.content || english['post-body']);
  return original.length >= 100 && original === localized && looksDanish(original);
}

/** Checks for untranslated prose. Proper titles and quoted Danish are allowed. */
export function assertEnglishProse(danish: Record<string, unknown>, english: Record<string, unknown>): void {
  for (const key of ['name', 'subtitle', 'intro', 'content', 'seo-title', 'meta-description', 'foto-credit', 'location']) {
    const original = articleVisibleText(danish[key]);
    const localized = articleVisibleText(english[key]);
    if (original && !localized) throw new Error(`Den engelske oversættelse mangler ${key}.`);
    if (looksDanish(localized)) throw new Error(`Dansk tekst fundet i det engelske felt ${key}.`);
    if (original === localized && ((key === 'content' && original) ||
        (['subtitle', 'intro'].includes(key) && original.length >= 48))) {
      throw new Error(`Den engelske oversættelse kopierer ${key} fra den danske artikel.`);
    }
  }
  const $ = load(String(english.content || ''));
  $('blockquote,q,script,style,iframe').remove();
  const bodyWords = $.root().text().toLowerCase().match(/[a-zæøå]+/g) ?? [];
  if (bodyWords.length >= 60 && bodyWords.filter(word => ENGLISH.has(word)).length < bodyWords.length / 8) {
    throw new Error('Den engelske brødtekst kunne ikke bekræftes som engelsk.');
  }
  for (const block of $('p,li,h2,h3,h4,figcaption').toArray()) {
    if (looksDanish($(block).text())) throw new Error('Den engelske brødtekst indeholder et dansk afsnit.');
  }
}

/** The translator may translate visible text and alt text, never links or assets. */
export function richTextStructure(value: string): string {
  const $ = load(value);
  return JSON.stringify($('*').toArray().flatMap(element => {
    if (element.type === 'text' || element.type === 'comment') return [];
    return [[element.name,
      Object.entries(element.attribs).filter(([name]) => name !== 'alt').sort(([a], [b]) => a.localeCompare(b)),
      $(element).parents().toArray().flatMap(parent => parent.type === 'text' || parent.type === 'comment' ? [] : [parent.name]),
    ]];
  }));
}
