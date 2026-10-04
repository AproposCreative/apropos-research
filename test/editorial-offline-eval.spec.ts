import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { readCalibrationCases } from '@/lib/editorial/calibration-cases';
import { qualityTextHash } from '@/lib/editorial/quality-evaluation';
const require = createRequire(import.meta.url);
const assertion = require('../tools/editorial-eval/assert-saved-output.cjs');
it('checks all 35 saved records without models or invented subjective scores', () => {
  for (const source of readCalibrationCases()) {
    const output = { ...source, textHash: qualityTextHash(source), humanScores: null, publicationApproval: false };
    expect(assertion(JSON.stringify(output))).toMatchObject({ pass: true, reason: expect.stringContaining('NOT a quality/factual score') });
    expect(assertion(JSON.stringify({ ...output, title: `${source.title} fake addition` })).pass).toBe(false);
    expect(assertion(JSON.stringify({ ...output, publicationApproval: true })).pass).toBe(false);
    expect(assertion(JSON.stringify({ ...output, humanScores: [5] })).pass).toBe(false);
  }
  expect(assertion('invalid')).toMatchObject({ pass: false });
});
