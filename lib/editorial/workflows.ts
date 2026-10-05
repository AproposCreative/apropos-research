import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
export const workflowInput = z.object({ workflow: z.enum(['review', 'edit', 'publish', 'submit']) }).strict();
const folders = { review: 'apropos-review-drafts', edit: 'apropos-edit-copy', publish: 'apropos-prepare-publication' };
export function editorialWorkflow(input: unknown) {
  const { workflow } = workflowInput.parse(input);
  if (workflow === 'submit') {
    const instructions = 'Ny artikel fra chatten: Hent get_submission_options. Gem teksten uændret med prepare_submission og et stabilt requestId. Stil højst tre spørgsmål ad gangen fra svaret, med reelle valgmuligheder. Udfyld kun manglende metadata ud fra teksten; opfind ikke forfatter, stjerner, citater eller oplevelser. Brug update_submission med expectedRevision. Film/TV: find rigtige officielle stills gennem find_submission_images. Koncerter: pressefotos eller tydelige Apropos-illustrationer bundet til sectionId fra get_submission_media_context. Cover og to forskellige brødtekstbilleder med faktisk kredit. Send previewUrl til Frederik: personlig prisaccept starter klargøring, ikke publikation. Hent samme get_submission_status efter timeout. Før udgivelse skal Frederik personligt se og godkende den eksakte færdige version på Apropos, nu eller planlagt i København. Et forsøgt CMS-kald er ikke en live artikel. Ingen fuld sitepublicering, Instagram, automatisk genkøb eller ændring af Livs kø. Manglende providercredits stopper kun betalte trin. Gemte resultater og faktiske blokeringer skal med i overleveringen.';
    return { workflow, instructions, versionHash: cmsFieldHash({ instructions }), paidAiCalls: 0, publicationApproval: false };
  }
  const instructions = readFileSync(path.join(process.cwd(), '.agents/skills', folders[workflow], 'SKILL.md'), 'utf8');
  return { workflow, instructions, versionHash: cmsFieldHash({ instructions }), paidAiCalls: 0,
    publicationApproval: false, note: 'Opgavevejledning, ikke ændring af rettigheder eller serverkontroller.' };
}
