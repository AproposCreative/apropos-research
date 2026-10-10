import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { IMAGE_HANDOFF_INSTRUCTION } from './image-generation-evidence';
import { COVER_SELECTION_INSTRUCTION, coverSelectionPolicy } from './cover-selection-policy';
export const workflowInput = z.object({ workflow: z.enum(['review', 'edit', 'publish', 'submit', 'read', 'liv']) }).strict();
const folders = { review: 'apropos-review-drafts', edit: 'apropos-edit-copy', publish: 'apropos-prepare-publication', read: 'apropos-read-book' };
export function editorialWorkflow(input: unknown): { workflow: string; instructions: string; versionHash: string; paidAiCalls: number; publicationApproval: boolean; [key: string]: unknown } {
  const { workflow } = workflowInput.parse(input);
  if (workflow === 'liv') {
    const submission = editorialWorkflow({ workflow: 'submit' });
    const instructions = 'Kør dagens Liv-produktion / skriv dagens Liv-artikel: start med get_liv_production_context. Genbrug existingSubmission med update_submission og expectedRevision; opret aldrig et nyt forløb efter timeout. Hent et gemt checkpoint med get_liv_work før ny skrivning. Brug editorial.voice og editorial.rules som kanonisk Liv-stemme/struktur, ikke en separat personlighed. Planens emne er kun et hint: verificér aktualitet, kilder og dubletter med chattens søgning og list_articles. Gem kilder/proveniens i submission.research. Skriv og kvalitetstjek i ChatGPT, udfyld SEO/meta/CMS-valg fra options. Brug prepare_submission med den returnerede livProduction-identitet (production) og requestId. Én separat reserve, ikke en betalt uge. Nye submissions har altid menneskelig slutkontrol uden betalt backend-AI; personlig klargøringsgodkendelse og versionsbundet publiceringsklik er fortsat nødvendige. Følg derefter submit-workflowet nedenfor. En planlagt ChatGPT-kørsel uden bruger skal stoppe ved personlig godkendelse, ikke opfinde den. Hver-anden-dag følger datologikken i konteksten, ikke lige datoer i måneden. Et off day er ikke en fejl. ChatGPT-assisteret arbejde tæller aldrig som uassisteret Liv, og ændrer ingen historiske fejl, provider-holds, reservationer eller gamle runs.';
    return { ...submission, workflow, instructions: instructions + '\n' + submission.instructions,
      versionHash: cmsFieldHash({ instructions, submitVersion: submission.versionHash }), automation: 'manual_start_supported; cloud_schedule_requires_account_verification; personal_approval_required' };
  }
  if (workflow === 'submit') {
    const instructions = 'Hent get_submission_options. Genbrug eksisterende submission; ellers prepare_submission med stabilt requestId og uændret tekst. Ved gennemlæst bog angiv readerSourceId: titel/forfatter/coverage følger med, ikke bogtekst. Højst tre nødvendige spørgsmål; update_submission med expectedRevision. Research, review på 550–700 ord, begrundede stjerner, SEO og billedproduktion sker i chatten. Opfind ikke oplevelser eller kilder. Film/TV bruger officielle stills; illustrationer bruger get_image_brief og chattens billedværktøj. import_submission_image bruger native fileParams, ikke en gættet URL eller sandbox-sti. Bevar valgte filer 1:1, ingen regeneration/crop/fallback. Cover kræves. To body images anbefales: gem brugerens valg om senere billeder som choices.bodyImages=deferred, og spørg ikke igen. Nye submissions er ChatGPT-first: choices.aiFinalChecks=human er standard; betalte backend-kontroller er deaktiveret. ChatGPT udfører redaktionel og visuel kontrol; brugeren bekræfter personligt resultatet. Personlig preview-knap bekræfter fravalget; ingen AI-køb, også under provider-hold. Schema, required fields, rastervalidering, CMS-identitet og readback er stadig obligatoriske. preview_submission viser hele teksten og billeder direkte i chatten. Senere godkendes præcis version via Publicér denne version. Ingen modelgodkendelse. Ved allerede live artikel: link_published_submission med korrekt itemId, importér billeder og godkend opdatering af samme artikel. Ingen create-dublet; tekst, SEO, rating og slug er låst i billedopdateringen. Hent status efter timeout, bevar receipts. Ingen sitepublicering, Instagram, budgetændring eller ændring af Livs automatiske kø. Historisk receipt er ikke frisk offentlig readback.';
    const imageInstructions = IMAGE_HANDOFF_INSTRUCTION + ' Hent først status og genbrug eksisterende assets. En manglende/afvigende generationReport bevarer billedet og kræver personligt billedvalg i preview, ikke ny generation. Billedvalg er ikke publiceringsgodkendelse. Hash-match er en klientindberetning, ikke observeret generatorinput.';
    return { workflow, instructions: instructions + '\n' + imageInstructions + '\n' + COVER_SELECTION_INSTRUCTION,
      coverSelectionPolicy: coverSelectionPolicy(),
      versionHash: cmsFieldHash({ instructions, imageInstructions, coverSelection: COVER_SELECTION_INSTRUCTION }), paidAiCalls: 0, publicationApproval: false };
  }
  const instructions = readFileSync(path.join(process.cwd(), '.agents/skills', folders[workflow], 'SKILL.md'), 'utf8') +
    (workflow === 'publish' ? '\n' + COVER_SELECTION_INSTRUCTION : '');
  return { workflow, instructions, ...(workflow === 'publish' ? { coverSelectionPolicy: coverSelectionPolicy() } : {}), versionHash: cmsFieldHash({ instructions }), paidAiCalls: 0,
    publicationApproval: false, note: 'Opgavevejledning, ikke ændring af rettigheder eller serverkontroller.' };
}
