import { readFileSync } from 'node:fs';
import { evaluateQualitySet } from '../lib/editorial/quality-evaluation';

const manifest = JSON.parse(readFileSync('data/editorial-evals/calibration-v1.json', 'utf8'));
const archive = readFileSync('data/apropos-style-samples.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line));
const references = manifest.referenceIds.map((id: string) => {
  const source = archive.find(row => row.id === id);
  if (!source) throw Error(`quality_reference_missing:${id}`);
  return { ...source, kind: 'published-reference', intro: source.intro || '' };
});
const drafts = JSON.parse(readFileSync('data/editorial-evals/problematic-drafts-v1.json', 'utf8'));
if (references.length !== 10 || drafts.length !== 5) throw Error('quality_calibration_incomplete');
const args = process.argv.slice(2);
const scoreIndex = args.indexOf('--scores');
const scores = scoreIndex >= 0 ? JSON.parse(readFileSync(args[scoreIndex + 1], 'utf8')) : [];
const cases = [...references, ...drafts];
const report = evaluateQualitySet(cases, scores);
if (args.includes('--review-pack')) {
  console.log('# Apropos: redaktionelt kalibreringssæt\n\nIngen betalte kald. Ikke et blindt holdout: referencerne ligger allerede i stilarkivet.');
  console.log('\nBedøm stemme, fakta, struktur og publicerbarhed fra 1 til 5. 1 kræver ny tekst; 3 kræver mærkbare rettelser; 5 er klar. Publication er ikke i sig selv en kvalitetsscore.');
  for (const article of cases) {
    const row = report.rows.find(r => r.id === article.id)!;
    console.log(`\n## ${article.title}\n\nID: ${article.id}\n\nTekstversion: ${row.textHash}\n\n${article.intro}\n\n${article.bodyText}\n\nBedømmelse: stemme __/5 · fakta __/5 · struktur __/5 · publicerbarhed __/5.\n\nBeslutning og begrundelse: __\n`);
  }
} else console.log(JSON.stringify(report, null, 2));
// Use this explicit mode before claiming a calibrated model/prompt comparison.
if (args.includes('--require-scored') && report.status !== 'human-scored') process.exitCode = 2;
