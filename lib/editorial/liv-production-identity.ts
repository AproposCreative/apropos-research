import { z } from 'zod';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { isPublicationDay, validDay } from '@/lib/liv/delivery-policy';

/** A private chat continuation, never a delivery-slot or automatic approval. */
export const livProductionIdentity = z.object({
  kind: z.enum(['scheduled', 'reserve']),
  day: z.string().refine(validDay, 'Invalid Copenhagen calendar day'),
}).strict().refine(value => value.kind === 'reserve' || isPublicationDay(value.day), 'Not a scheduled publication day');
export type LivProductionIdentity = z.infer<typeof livProductionIdentity>;
export function livProductionSubmissionId(uid: string, production: LivProductionIdentity) {
  return cmsFieldHash({ uid, livProduction: livProductionIdentity.parse(production) });
}
