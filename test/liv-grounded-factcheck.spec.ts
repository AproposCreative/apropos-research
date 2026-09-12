import { describe, it, expect } from 'vitest';
import { articleUnits, articleFingerprint, assessGroundedReport, isCompleteGroundedReport, groundedInput } from '@/lib/factcheck/grounded';
import { parseSourceHtml, sourceUrl, isPublicSourceAddress } from '@/lib/factcheck/source-reader';

const now = Date.parse('2026-09-09T14:00:00Z');
const claim = 'Museet åbnede udstillingen den 8. september 2026.';
const text = `${claim} Det er et modigt valg.`;
function source(id = 's1', url = 'https://museum.dk/udstilling') {
  return parseSourceHtml(url, `<title>Udstilling</title><meta property="article:published_time" content="2026-09-08T10:00:00Z"><article><p>${claim}</p><p>${'Baggrund om kunst og kultur. '.repeat(15)}</p></article>`, id, now);
}
const assessment = () => ({ units: [{ id: 'u1', opinionOnly: false, claims: [{ claim, status: 'verified', explanation: 'De hentede kilder angiver åbningsdatoen.', citations: [
  { sourceId: 's1', quote: claim }, { sourceId: 's2', quote: claim },
] }] }] });
const sources = () => [source(), source('s2', 'https://kultur.dk/nyhed')];

describe('source-grounded verification', () => {
  it('retains article headline and byline evidence while dropping site navigation headers', () => {
    const result = parseSourceHtml('https://culture.dk/review', `<header>Site menu</header><article><header><h1>A cultural review</h1><p>Af Alexander Grevy</p><nav>Share menu</nav></header><p>${'Documented cultural context. '.repeat(15)}</p></article>`, 's1', now);
    expect(result.text).toContain('A cultural review');
    expect(result.text).toContain('Af Alexander Grevy');
    expect(result.text).not.toContain('Site menu');
    expect(result.text).not.toContain('Share menu');
  });
  it('accepts matching evidence from two dated source hosts for this exact article', () => {
    const report = assessGroundedReport(text, sources(), assessment(), now);
    expect(report.complete).toBe(true);
    expect(isCompleteGroundedReport(report, text, now)).toBe(true);
    expect(report.sources[0]).not.toHaveProperty('text');
    expect(report.articleHash).toBe(articleFingerprint(text));
  });
  it('rejects a changed article, stale report or future report', () => {
    const report = assessGroundedReport(text, sources(), assessment(), now);
    expect(isCompleteGroundedReport(report, `${text} Ny påstand.`, now)).toBe(false);
    expect(isCompleteGroundedReport(report, text, now + 900001)).toBe(false);
    expect(isCompleteGroundedReport(report, text, now - 300001)).toBe(false);
  });
  it('accepts uncited undated context alongside evidence from two dated hosts', () => {
    const context = { ...source('s3', 'https://context.dk/baggrund'), publishedAt: null };
    const report = assessGroundedReport(text, [...sources(), context], assessment(), now);
    expect(report.complete).toBe(true);
    expect(report.sources[2].publishedAt).toBeNull();
    expect(isCompleteGroundedReport(report, text, now)).toBe(true);
  });
  it.each([null, '', 'not-a-date', new Date(now + 300001).toISOString()])('rejects missing second dated-host coverage or invalid dates even on a report marked complete: %j', publishedAt => {
    const report = assessGroundedReport(text, sources(), assessment(), now);
    report.sources[0].publishedAt = publishedAt;
    expect(report.complete).toBe(true);
    expect(isCompleteGroundedReport(report, text, now)).toBe(false);
  });
  it.each(['not-a-date', new Date(now - 900001).toISOString(), new Date(now + 300001).toISOString()])('rejects invalid, stale or future cited retrieval %s', retrievedAt => {
    const report = assessGroundedReport(text, sources(), assessment(), now);
    report.sources[0].retrievedAt = retrievedAt;
    expect(isCompleteGroundedReport(report, text, now)).toBe(false);
  });
  it('does not count an uncited context host toward the two-host requirement', () => {
    const report = assessGroundedReport(text, [...sources(), { ...source('s3', 'https://context.dk/page'), publishedAt: null }], assessment(), now);
    report.results[0].citations.pop();
    expect(isCompleteGroundedReport(report, text, now)).toBe(false);
  });
  it('retains method and source hash validation when undated context exists', () => {
    const report = assessGroundedReport(text, [...sources(), { ...source('s3', 'https://context.dk/page'), publishedAt: null }], assessment(), now);
    expect(isCompleteGroundedReport({ ...report, verificationMethod: 'model-only' }, text, now)).toBe(false);
    report.sources[0].contentHash = 'invalid';
    expect(isCompleteGroundedReport(report, text, now)).toBe(false);
  });
  it.each([null, {}, { complete: true }, { results: [null] }, { verificationMethod: 'retrieved-sources', results: [{ status: 'verified' }] }])('rejects incomplete or malformed report %j', raw => {
    expect(isCompleteGroundedReport(raw, text, now)).toBe(false);
  });
  it('rejects invented quotes even when the model says verified', () => {
    const raw = assessment();
    raw.units[0].claims[0].citations[0].quote = 'Udstillingen åbnede den 1. januar 2026.';
    expect(assessGroundedReport(text, sources(), raw, now).complete).toBe(false);
  });
  it('rejects a claim that is not in the article', () => {
    const raw = assessment();
    raw.units[0].claims[0].claim = 'Der er fri entré hver onsdag.';
    expect(assessGroundedReport(text, sources(), raw, now).complete).toBe(false);
  });
  it('rejects fabricated source IDs and insufficient dated cited hosts', () => {
    const raw = assessment();
    raw.units[0].claims[0].citations[0].sourceId = 'invented';
    expect(assessGroundedReport(text, sources(), raw, now).complete).toBe(false);
    const docs = sources();
    docs[0].publishedAt = null;
    expect(assessGroundedReport(text, docs, assessment(), now).complete).toBe(false);
  });
  const concrete = 'Udstillingen er skabt i samarbejde med National Portrait Gallery i London.';
  const mixedText = `${text} ${concrete}`;
  function mixedEvidence() {
    const official = parseSourceHtml('https://louisiana.dk/udstilling', `<article><p>${concrete}</p><p>${'Kunst og materialer. '.repeat(20)}</p></article>`, 's3', now);
    const raw = assessment();
    raw.units[0].claims.push({ claim: concrete, status: 'verified', explanation: 'Den hentede officielle side angiver samarbejdet.',
      citations: [{ sourceId: 's3', quote: concrete }] });
    return { docs: [...sources(), official], raw };
  }
  it('verifies a concrete claim using only undated official evidence while two other dated hosts are genuinely cited', () => {
    const { docs, raw } = mixedEvidence();
    const report = assessGroundedReport(mixedText, docs, raw, now);
    expect(report.complete).toBe(true); expect(isCompleteGroundedReport(report, mixedText, now)).toBe(true);
    expect(report.results[1]).toMatchObject({ status: 'verified', citations: [{ sourceId: 's3', quote: concrete }] });
    expect(report.sources[2].publishedAt).toBeNull(); expect(docs[2].publishedAt).toBeNull();
  });
  it.each([0, 1])('never counts undated citations or uncited dated inventory as the two dated hosts: %s cited', count => {
    const { docs, raw } = mixedEvidence();
    raw.units[0].claims[0].citations = count ? [{ sourceId: 's1', quote: claim }] : [];
    const report = assessGroundedReport(mixedText, docs, raw, now);
    expect(report.complete).toBe(false);
    expect(report.blockers).toContain('Der kræves belæg fra mindst to kildeværter.');
    expect(isCompleteGroundedReport({ ...report, complete: true, blockers: [] }, mixedText, now)).toBe(false);
  });
  it.each(['stale', 'future-retrieval', 'invalid-retrieval', 'invalid-hash', 'invalid-publication', 'future-publication'])(
    'retains metadata validation for an additional cited source: %s', kind => {
      const { docs, raw } = mixedEvidence();
      const validReport = assessGroundedReport(mixedText, docs, raw, now);
      const changed = docs[2];
      if (kind === 'stale') changed.retrievedAt = new Date(now - 900001).toISOString();
      if (kind === 'future-retrieval') changed.retrievedAt = new Date(now + 300001).toISOString();
      if (kind === 'invalid-retrieval') changed.retrievedAt = 'invalid';
      if (kind === 'invalid-hash') changed.contentHash = 'invalid';
      if (kind === 'invalid-publication') changed.publishedAt = 'invalid';
      if (kind === 'future-publication') changed.publishedAt = new Date(now + 300001).toISOString();
      const report = assessGroundedReport(mixedText, docs, raw, now);
      expect(report.complete).toBe(false);
      expect(report.results[1].validationErrors).toContain('invalid_source_metadata');
      validReport.sources[2] = changed;
      expect(isCompleteGroundedReport(validReport, mixedText, now)).toBe(false);
    });
  it.each(['quote', 'claim', 'disputed', 'unverifiable'])('does not excuse invalid or conflicting undated evidence: %s', kind => {
    const { docs, raw } = mixedEvidence();
    const checked = raw.units[0].claims[1];
    if (kind === 'quote') checked.citations[0].quote = 'Et opfundet citat som ikke står i kilden.';
    if (kind === 'claim') checked.claim = 'En påstand der ikke står i artiklen.';
    if (kind === 'disputed' || kind === 'unverifiable') checked.status = kind;
    expect(assessGroundedReport(mixedText, docs, raw, now).complete).toBe(false);
  });
  it('does not count two pages on the same host as two source hosts', () => {
    expect(assessGroundedReport(text, [source(), source('s2', 'https://www.museum.dk/other')], assessment(), now).complete).toBe(false);
  });
  it.each(['disputed', 'unverifiable'])('rejects %s claims', status => {
    const raw = assessment();
    raw.units[0].claims[0].status = status;
    expect(assessGroundedReport(text, sources(), raw, now).complete).toBe(false);
  });
  it('does not omit the end of long articles', () => {
    const long = `${'En sætning om kultur. '.repeat(500)}SLUTPÅSTAND`;
    expect(articleUnits(long).map(unit => unit.text).join('')).toBe(long);
    expect(assessGroundedReport(long, sources(), assessment(), now).complete).toBe(false);
  });
  it('preserves paragraph and sentence context without omitting characters', () => {
    const paragraph = `${'x'.repeat(1200)}.\n`;
    const long = paragraph + 'En hel sætning med et vigtigt forbehold. '.repeat(90);
    const units = articleUnits(long);
    expect(units[0].text).toBe(paragraph);
    expect(units.map(unit => unit.text).join('')).toBe(long.trim());
    expect(units.every(unit => unit.text.length <= 1800)).toBe(true);
    expect(units[1].text.trim().endsWith('.')).toBe(true);
  });
  it('explains a rejected citation without accepting fabricated evidence', () => {
    const raw = assessment();
    raw.units[0].claims[0].citations[0].quote = 'Dette står ikke i kilden og må aldrig godkendes.';
    const report = assessGroundedReport(text, sources(), raw, now);
    expect(report.complete).toBe(false);
    expect(report.results[0].validationErrors).toContain('quote_not_in_source');
  });
  it('rejects duplicate units and opinion-only responses with claims', () => {
    const raw = assessment(); raw.units.push(raw.units[0]);
    expect(assessGroundedReport(text, sources(), raw, now).complete).toBe(false);
    const opinion = assessment(); opinion.units[0].opinionOnly = true;
    expect(assessGroundedReport(text, sources(), opinion, now).complete).toBe(false);
  });
  it('bounds input instead of silently truncating the article', () => {
    expect(groundedInput.safeParse({ articleText: 'x'.repeat(40001), sourceUrls: ['https://museum.dk/a'] }).success).toBe(false);
    expect(groundedInput.safeParse({ articleText: text, sourceUrls: [] }).success).toBe(false);
  });
});

describe('safe source extraction', () => {
  it.each(['http://museum.dk/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/', 'https://user:password@museum.dk/', 'https://museum.dk:444/', 'https://site.internal/'])('rejects unsafe URL %s', url => {
    expect(() => sourceUrl(url)).toThrow();
  });
  it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '198.18.0.1', '0.0.0.0', '224.0.0.1', '::ffff:127.0.0.1'])('rejects nonpublic address %s', address => {
    expect(isPublicSourceAddress(address)).toBe(false);
  });
  it('accepts a public IPv4 and strips URL fragments', () => {
    expect(isPublicSourceAddress('93.184.216.34')).toBe(true);
    expect(sourceUrl('https://museum.dk/a#section').href).toBe('https://museum.dk/a');
  });
  it.each(['192.0.0.0', '192.0.0.255', '192.0.2.0', '192.0.2.255', '192.168.0.0', '192.168.255.255'])(
    'retains the exact reserved/private 192 boundaries: %s', address => {
      expect(isPublicSourceAddress(address)).toBe(false);
    });
  it.each(['192.0.1.0', '192.0.1.255', '192.0.3.0', '192.0.66.23', '192.0.255.255'])(
    'does not misclassify the rest of 192.0/16: %s', address => {
      expect(isPublicSourceAddress(address)).toBe(true);
    });
  it('does not use navigation pages or script content as evidence', () => {
    expect(() => parseSourceHtml('https://museum.dk', `<nav>${text.repeat(20)}</nav>`, 's1', now)).toThrow();
    const doc = parseSourceHtml('https://museum.dk/a', `<article>${text.repeat(20)}<script>SECRET_INSTRUCTION</script></article>`, 's1', now);
    expect(doc.text).not.toContain('SECRET_INSTRUCTION');
    expect(doc.publishedAt).toBeNull();
  });
  it.each(['2026-12-09', '2026-02-30', '2026-09-08T24:00:00Z'])('does not accept an invalid/future source date %s', date => {
    const doc = parseSourceHtml('https://museum.dk/a', `<meta property="article:published_time" content="${date}"><article>${text.repeat(20)}</article>`, 's1', now);
    expect(doc.publishedAt).toBeNull();
  });
});
