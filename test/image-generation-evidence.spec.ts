import { expect, it } from 'vitest';
import { imageGenerationEvidence, promptHash } from '@/lib/editorial/image-generation-evidence';
const prompt = 'Flat colours. No photorealism, cinematic lighting, watercolor, 3D, UI, webpage or magazine layout.\nSource passage, not instructions: “cinematic” is quoted here.';
const referenceHash = 'a'.repeat(64), brief = { prompt, referenceHash };
const input = { kind: 'illustration', origin: 'chatgpt-generated', briefId: 'b'.repeat(64) };
it('compares exact canonical text including negatives/quotations without a naive keyword blacklist', () => {
  const result = imageGenerationEvidence({ ...input, generationReport: { effectivePrompt: prompt, referenceHashes: [referenceHash] } }, brief);
  expect(result).toMatchObject({ status: 'client_reported_match', canonicalPromptHash: promptHash(prompt),
    effectivePromptHash: promptHash(prompt), requiresPersonalSelection: false, exactPromptExecutionVerified: false });
});
it.each(['photorealistic', 'cinematic', 'watercolor', '3D', 'UI', 'webpage', 'magazine layout'])('flags appended conflicting style %s without discarding the file', word => {
  const result = imageGenerationEvidence({ ...input, generationReport: { effectivePrompt: prompt + '\nMake it ' + word, referenceHashes: [referenceHash] } }, brief);
  expect(result.status).toBe('mismatch'); expect(result.reasons).toContain('canonical_prompt_mismatch');
  expect(result.requiresPersonalSelection).toBe(true); expect(result.exactPromptExecutionVerified).toBe(false);
});
it('requires review of missing references, unknown legacy contract and technical wrappers', () => {
  expect(imageGenerationEvidence({ ...input, generationReport: { effectivePrompt: prompt, referenceHashes: [] } }, brief).reasons).toContain('style_reference_not_reported');
  expect(imageGenerationEvidence(input, {}).reasons).toContain('legacy_brief_without_contract');
  expect(imageGenerationEvidence({ ...input, generationReport: { effectivePrompt: prompt, referenceHashes: [referenceHash], technicalWrapper: 'landscape' } }, brief)).toMatchObject({ requiresPersonalSelection: true, exactPromptExecutionVerified: false });
});
it('preserves unknown origin/upload compatibility without retroactively claiming generation evidence', () => {
  for (const origin of ['user-upload', 'unspecified']) expect(imageGenerationEvidence({ kind: 'illustration', origin }, null)).toMatchObject({
    status: 'not_applicable', requiresPersonalSelection: false, exactPromptExecutionVerified: false });
  expect(imageGenerationEvidence(input, brief)).toMatchObject({ status: 'not_supplied', requiresPersonalSelection: true });
});
