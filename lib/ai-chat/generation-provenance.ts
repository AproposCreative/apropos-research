import { createHash } from 'node:crypto';
import type { PromptSegment } from './prompt-segment-types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Diagnostics attached to the private draft, never publication approval.
 * Hashes retain identity without copying private prompts into analytics. */
export function writerGenerationProvenance(input: {
  modelRequested: string; modelReturned?: string; temperature: number | null;
  systemPrompt: string; segments: PromptSegment[]; response: string;
  requestMessages: unknown; createdAt?: string;
}) {
  return {
    version: 'writer-generation-v1', createdAt: input.createdAt ?? new Date().toISOString(),
    modelRequested: input.modelRequested, modelReturned: input.modelReturned || null,
    temperature: input.temperature, promptHash: hash(input.systemPrompt),
    messagesHash: hash(JSON.stringify(input.requestMessages)), responseHash: hash(input.response),
    selectionPolicy: 'stable-article-opening-and-samples-v1',
    segments: input.segments.filter(s => s.included).map(s => ({ id: s.id, hash: hash(s.content) })),
    editorialApproval: false,
  };
}
