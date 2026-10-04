import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
export const workflowInput = z.object({ workflow: z.enum(['review', 'edit', 'publish']) }).strict();
const folders = { review: 'apropos-review-drafts', edit: 'apropos-edit-copy', publish: 'apropos-prepare-publication' };
export function editorialWorkflow(input: unknown) {
  const { workflow } = workflowInput.parse(input);
  const instructions = readFileSync(path.join(process.cwd(), '.agents/skills', folders[workflow], 'SKILL.md'), 'utf8');
  return { workflow, instructions, versionHash: cmsFieldHash({ instructions }), paidAiCalls: 0,
    publicationApproval: false, note: 'Opgavevejledning, ikke ændring af rettigheder eller serverkontroller.' };
}
