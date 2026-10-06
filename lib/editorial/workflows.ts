import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
export const workflowInput = z.object({ workflow: z.enum(['review', 'edit', 'publish', 'submit', 'read']) }).strict();
const folders = { review: 'apropos-review-drafts', edit: 'apropos-edit-copy', publish: 'apropos-prepare-publication', read: 'apropos-read-book' };
export function editorialWorkflow(input: unknown) {
  const { workflow } = workflowInput.parse(input);
  if (workflow === 'submit') {
    const instructions = 'Hent get_submission_options og gem brugerens tekst uændret med prepare_submission/stabilt requestId. Højst tre nødvendige spørgsmål fra rigtige CMS-valg; update_submission med expectedRevision. Opfind ikke forfatter, stjerner, citater eller oplevelser. Research, skrivning, SEO-forslag og billedproduktion sker i chattens egne værktøjer. Film/TV: find_submission_images på officielle sider, aldrig AI-stills. Illustrationer: get_submission_media_context, get_image_brief med konkret excerpt/sectionId, brug den returnerede prompt og stilreference i chattens billedværktøj, derefter import_submission_image med den faktiske fil. Undersøg portrætlighed før generation; ingen dokumentariske falske koncertfotos. Bevar cover og eksisterende billeder medmindre brugeren vælger erstatning. Cover plus to forskellige brødtekstbilleder med reel kredit. preview_submission viser hele artiklen direkte i chatten og giver personlig knap til prisaccept af kun nødvendige slutkontroller. En senere særskilt knap godkender præcis den færdige version til udgivelse nu eller planlagt i København. Ingen modelgodkendelse eller automatisk API-fallback. previewUrl er fallback hvis klienten ikke understøtter interaktive previews. Hent samme status efter timeout; bevar receipts/tekst/billeder. Kollegers forløb er private; byline er ikke adgang. Ingen sitepublicering, Instagram, budgetændring eller ændring af Livs kø. En gemt historisk publiceringskvittering er ikke frisk offentlig readback.';
    return { workflow, instructions, versionHash: cmsFieldHash({ instructions }), paidAiCalls: 0, publicationApproval: false };
  }
  const instructions = readFileSync(path.join(process.cwd(), '.agents/skills', folders[workflow], 'SKILL.md'), 'utf8');
  return { workflow, instructions, versionHash: cmsFieldHash({ instructions }), paidAiCalls: 0,
    publicationApproval: false, note: 'Opgavevejledning, ikke ændring af rettigheder eller serverkontroller.' };
}
