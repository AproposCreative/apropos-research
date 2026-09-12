/** Reproduce the 2026-09-12 live-CMS calibration; no API or model calls. */
import fs from 'node:fs';
const snapshot = JSON.parse(fs.readFileSync('docs/editorial/liv-length-baseline-2026-09-12.json', 'utf8'));
const excluded = new Set(['6aa51107feea4b5112862f09', '6aa3dd07e599b5bd46655a28', '6aa2e6c600106ab5cda323a8', '6aa25ad86a1d9776ca18ee12']);
type Row = { id: string; words: number; topics?: string[]; topic?: string; rating?: number };
const rows: Row[] = snapshot.records.filter((r: Row) => !excluded.has(r.id) && r.words > 0);
if (!snapshot.complete || snapshot.total !== snapshot.records.length || new Set(rows.map(r => r.id)).size !== rows.length) throw Error('baseline_incomplete_or_duplicate');
const review = (r: Row) => (r.rating || 0) > 0 || (r.topics || []).includes('67e6f8f2e077ea42a9b95b87');
const stats = (records: Row[]) => {
  const values = records.map(r => r.words).sort((a, b) => a - b);
  const quantile = (p: number) => { const index = (values.length - 1) * p; return values[Math.floor(index)] + (values[Math.ceil(index)] - values[Math.floor(index)]) * (index % 1); };
  return { count: values.length, median: quantile(.5), q1: quantile(.25), q3: quantile(.75), min: values[0], max: values.at(-1) };
};
console.log(JSON.stringify({ retrievedAt: snapshot.retrievedAt, total: snapshot.total, excludedPilotIds: [...excluded],
  all: stats(rows), reviewProxy: stats(rows.filter(review)),
  filmTvReviewProxy: stats(rows.filter(r => review(r) && [r.topic, ...r.topics || []].some(t => ['67dbf52a4ac2cf0073a9b0ef', '67dbf17ba540975b5b21c303'].includes(t || '')))),
  otherFormats: stats(rows.filter(r => !review(r))),
}, null, 2));
