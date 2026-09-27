import { describe, expect, it, vi } from 'vitest';
import { buildPromptSegments, composeSystemPrompt } from '@/lib/ai-chat/build-system-prompt';
import { writerGenerationProvenance } from '@/lib/ai-chat/generation-provenance';

describe('stable Writer prompts and provenance', () => {
  it('does not choose a new opening or sample set between identical requests', () => {
    const random = vi.spyOn(Math, 'random');
    const context = { title: 'Kulturens konkrete spørgsmål', section: 'Kultur' };
    try {
      expect(buildPromptSegments('En præcis stemme', 'Frederik', context))
        .toEqual(buildPromptSegments('En præcis stemme', 'Frederik', context));
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });
  it('puts stable instructions before article metadata and retains locked rules', () => {
    const segments = buildPromptSegments('Privat TOV', 'Frederik', { title: 'Film A' });
    const prompt = composeSystemPrompt(segments, { structure: false, 'author-tov': false }, null);
    expect(prompt.indexOf('APROPOS STRUCTURE')).toBeLessThan(prompt.indexOf('Arbejdstitel/emne'));
    expect(prompt).not.toContain('Privat TOV');
    expect(prompt).toContain('ÅBNINGSSTRATEGI FOR DENNE ARTIKEL');
  });
  it('records returned and requested models without inventing a provider identity', () => {
    const input = { modelRequested: 'fixture', temperature: null, systemPrompt: 'private prompt',
      segments: [{ id: 'base', labelDa: 'Base', kind: 'system' as const, included: true, content: 'private prompt' }],
      response: 'private article', requestMessages: [{ role: 'user', content: 'private request' }], createdAt: '2026-09-27T09:00:00.000Z' };
    const receipt = writerGenerationProvenance(input);
    expect(receipt.modelReturned).toBeNull();
    expect(receipt.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.editorialApproval).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('private');
    expect(writerGenerationProvenance({ ...input, modelReturned: 'fixture-snapshot' }).modelReturned).toBe('fixture-snapshot');
    expect(writerGenerationProvenance({ ...input, systemPrompt: 'changed' }).promptHash).not.toBe(receipt.promptHash);
    expect(writerGenerationProvenance({ ...input, response: 'changed' }).responseHash).not.toBe(receipt.responseHash);
  });
});
