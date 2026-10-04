import { readFileSync } from 'node:fs';
import path from 'node:path';
import { qualityCaseSchema, type QualityCase } from './quality-evaluation';
/** Local saved texts only. No import of provider clients, environment or network. */
export function readCalibrationCases(root = process.cwd()): QualityCase[] {
  const manifest = JSON.parse(readFileSync(path.join(root, 'data/editorial-evals/calibration-v1.json'), 'utf8'));
  const archive = readFileSync(path.join(root, 'data/apropos-style-samples.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const references = manifest.referenceIds.map((id: string) => {
    const source = archive.find(row => row.id === id);
    if (!source) throw Error('quality_reference_missing');
    return { ...source, kind: 'published-reference', intro: source.intro || '' };
  });
  const drafts = JSON.parse(readFileSync(path.join(root, 'data/editorial-evals/problematic-drafts-v1.json'), 'utf8'));
  if (references.length !== 25 || drafts.length !== 10) throw Error('quality_calibration_incomplete');
  return [...references, ...drafts].map(value => qualityCaseSchema.parse(value));
}
