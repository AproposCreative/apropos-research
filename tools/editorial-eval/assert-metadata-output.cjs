const path = require('node:path');
module.exports = async output => {
  try {
    // tsx is preloaded by the fixed launcher; source truth never comes from output.
    const { readMetadataCases, compareMetadata } = await import('../../lib/editorial/metadata-evaluation.ts');
    const candidate = JSON.parse(output), source = readMetadataCases(path.resolve(__dirname, '../..')).find(row => row.caseId === candidate.caseId);
    if (!source) throw Error('metadata_unknown_case');
    const result = compareMetadata(source, candidate), pass = result.regressions.length === 0;
    return { pass, score: pass ? 1 : 0,
      reason: `Regression screen, NOT quality/factual approval. Existing findings: ${result.before.length}. New/worse findings: ${JSON.stringify(result.regressions)}. Semantic/human review remains required.` };
  } catch { return { pass: false, score: 0, reason: 'Invalid candidate or source-version mismatch. No model called.' }; }
};
