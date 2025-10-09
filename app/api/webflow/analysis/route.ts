import { NextResponse } from 'next/server';
import { getArticlesCollectionFieldsDetailed } from '@/lib/webflow-service';
import { readMapping } from '@/lib/webflow-mapping';

export async function GET() {
  try {
    const [fields, mapping] = await Promise.all([
      getArticlesCollectionFieldsDetailed(),
      Promise.resolve(readMapping()),
    ]);

    // Build simple guidance per field
    const guidance = fields.map((f:any)=>({
      slug: f.slug,
      type: f.type,
      required: !!f.required,
      suggestedInternal: mapping.entries.find(e=>e.webflowSlug===f.slug)?.internal,
      tip: tipForField(f.slug, f.type, f.required),
    }));

    return NextResponse.json({ guidance });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to analyze' }, { status: 500 });
  }
}

function tipForField(slug?: string, type?: string, required?: boolean): string {
  const s = (slug||'').toLowerCase();
  if (s==='name' || s==='title') return 'Brug en kort, fængende titel; max ~60 tegn for SEO.';
  if (s==='post-body') return 'HTML med overskrifter (h2/h3), korte afsnit, citater og links; undgå raw iframes.';
  if (s==='excerpt' || s==='description') return '1-2 sætninger som teaser; 140–160 tegn anbefalet.';
  if (s==='slug') return 'kebab-case, ingen specialtegn; genereres fra titel men kan tilpasses.';
  if (s==='seo-title') return 'Hold den under 60 tegn; inkluder primært keyword og brand hvis plads.';
  if (s==='seo-description') return 'Meta-beskrivelse 140–160 tegn; aktiv stemme og call-to-action.';
  if (s==='publish-date') return 'ISO dato; brug nuværende tidspunkt ved udgivelse, eller planlagt tidspunkt.';
  if (s==='author') return 'Reference til forfatterens itemId i Authors collection; vælg automatisk ud fra TOV.';
  if (s==='tags') return '3–6 tags; små bogstaver; undgå duplikater.';
  if (s==='category') return 'En af de tilladte kategorier; match AI-tema til taxonomy.';
  if (s==='featured-image') return 'URL til billede i 1200x630; web-optimeret; alt-tekst fra titel.';
  return required ? 'Påkrævet felt – AI bør altid udfylde dette.' : 'Valgfrit felt – udfyld hvis relevant.';
}


