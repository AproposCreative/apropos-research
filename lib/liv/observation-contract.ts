import { z } from 'zod';

const text = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine(value => !/[<>\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value) && !/\[udfyld\]/i.test(value));
export const observationRunId = z.string().regex(/^(?:daily|prepare|prepare-alternative|reserve|reserve-editorial)-20\d{2}-\d{2}-\d{2}$/);
export const observationReferenceSchema = z.object({ runId: observationRunId,
  checkpointHash: z.string().regex(/^[a-f0-9]{64}$/), evidenceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type ObservationReference = z.infer<typeof observationReferenceSchema>;
export const observationInput = z.object({
  runId: observationRunId, expectedCheckpointHash: z.string().regex(/^[a-f0-9]{64}$/),
  event: text(5, 200), experiencedOn: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
  articleQuote: text(20, 600), observation: text(20, 600),
  confirmOwnExperience: z.literal(true), shareWithEditorial: z.literal(true),
}).strict();
export type ObservationInput = z.infer<typeof observationInput>;
export type ObservationReceipt = ObservationInput & { userId: string; witness: string; confirmedAt: string };
export type ObservationBaseline = { runId: string; checkpointHash: string; title: string; content: string;
  intro: string; witness: string; confirmed: ObservationReceipt | null };

export function observationWitness(email: string | undefined): string | null {
  return ({ 'frederik@aproposmagazine.com': 'Frederik Kragh', 'casper@aproposmagazine.com': 'Casper',
    'milo@aproposmagazine.com': 'Milo' } as Record<string, string>)[email?.trim().toLowerCase() || ''] || null;
}
