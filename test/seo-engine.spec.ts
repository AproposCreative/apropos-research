import { describe, expect, it } from 'vitest';
import {
  canonicalizeInput,
  computeInputVersionHash,
} from '../lib/seo-engine/hash';
import type { SeoEngineInputContract } from '../lib/seo-engine/schema';
import { toConfidenceBand } from '../lib/seo-engine/confidence';
import { buildNormalizedInputText, locateQuoteInText } from '../lib/seo-engine/long-article';
import {
  domainToMappingInternal,
  getCmsPublishability,
  toWebflowSeoPatch,
} from '../lib/seo-engine/webflow-adapter';
import { parseFieldValue } from '../lib/seo-engine/field-paths';
import { findForbiddenPhrases } from '../lib/seo-engine/forbidden-phrases';
import { buildDemoAnalysis, buildDemoStrategyPack } from '../lib/seo-engine/demo-pipeline';
import { adoptAlternativeInPack } from '../lib/seo-engine/adopt';
import { ARTICLE_TYPE_OPTIONS, EDITOR_FIELD_ORDER } from '../lib/seo-engine/ui-helpers';
import { validateSeoPack } from '../lib/seo-engine/validator';
import { SEO_ENGINE_LONG_ARTICLE_CHARS } from '../lib/seo-engine/versions';
import { buildProvisionalJobId } from '../lib/seo-engine/jobs';
import { cmsSeoEmptiness } from '../lib/seo-engine/cms-contract';
import { diffPublishFields } from '../lib/seo-engine/history';

function baseInput(over: Partial<SeoEngineInputContract> = {}): SeoEngineInputContract {
  return {
    editorialTitle: 'The Odyssey — mørket der blev tilbage',
    language: 'da',
    body: 'x'.repeat(250),
    intro: 'En film der bliver hængende i kroppen.',
    articleType: 'Filmanmeldelse',
    knownFacts: ['Instruktør nævnt i pressemateriale'],
    notesForAi: 'Hold tonen nede',
    relatedAproposArticles: [{ title: 'Anden film', url: 'https://example.com/a' }],
    existingSeoTitle: null,
    existingMetaDescription: null,
    ...over,
  };
}

describe('seo-engine hash contract', () => {
  it('is stable for key order', () => {
    const a = baseInput({ subtitle: 'Sub', city: 'København' });
    const b = baseInput({ city: 'København', subtitle: 'Sub' });
    expect(computeInputVersionHash(a)).toBe(computeInputVersionHash(b));
  });

  it('changes when notesForAi changes', () => {
    const a = computeInputVersionHash(baseInput({ notesForAi: 'A' }));
    const b = computeInputVersionHash(baseInput({ notesForAi: 'B' }));
    expect(a).not.toBe(b);
  });

  it('changes when locked existing SEO changes', () => {
    const a = computeInputVersionHash(baseInput({ existingSeoTitle: null }));
    const b = computeInputVersionHash(baseInput({ existingSeoTitle: 'Existing SEO' }));
    expect(a).not.toBe(b);
  });

  it('includes knownFacts and related articles in canonical form', () => {
    const raw = canonicalizeInput(
      baseInput({
        knownFacts: ['Fakta 1'],
        relatedAproposArticles: [{ id: '1', title: 'T' }],
      })
    );
    expect(raw).toContain('Fakta 1');
    expect(raw).toContain('"relatedAproposArticles"');
  });
});

describe('seo-engine confidence bands', () => {
  it('applies penalties beyond raw thresholds', () => {
    const highRaw = toConfidenceBand({
      raw: 0.9,
      evidenceCount: 2,
      hasConflict: false,
      missingFactCount: 0,
      inputMode: 'full',
    });
    expect(highRaw.band).toBe('high');

    const penalized = toConfidenceBand({
      raw: 0.9,
      evidenceCount: 0,
      hasConflict: true,
      missingFactCount: 3,
      inputMode: 'long_article_extract',
    });
    expect(penalized.band).not.toBe('high');
    expect(penalized.reasons.length).toBeGreaterThan(1);
  });
});

describe('seo-engine long-article path', () => {
  it('uses full mode under threshold', () => {
    const r = buildNormalizedInputText(baseInput({ body: 'y'.repeat(1000) }));
    expect(r.inputMode).toBe('full');
    expect(r.normalizedText).toContain('The Odyssey');
  });

  it('uses explicit extract mode over threshold and keeps tail', () => {
    const body = `START-${'a'.repeat(SEO_ENGINE_LONG_ARTICLE_CHARS)}-VERDICT-END`;
    const r = buildNormalizedInputText(baseInput({ body }));
    expect(r.inputMode).toBe('long_article_extract');
    expect(r.normalizedText).toContain('VERDICT-END');
    expect(r.extractManifest?.originalBodyChars).toBe(body.length);
  });

  it('locates quotes with stable offsets', () => {
    const text = 'AAA Intro her. BBB';
    const loc = locateQuoteInText(text, 'Intro her');
    expect(loc).not.toBeNull();
    expect(text.slice(loc!.startOffset, loc!.endOffset)).toBe(loc!.quote);
  });
});

describe('seo-engine webflow adapter', () => {
  it('maps metaDescription via seoDescription mapping internal', () => {
    expect(domainToMappingInternal('metaDescription')).toBe('seoDescription');
    expect(domainToMappingInternal('seoTitle')).toBe('seoTitle');
  });

  it('writes only known CMS slugs', () => {
    const patch = toWebflowSeoPatch({
      seoTitle: 'Titel',
      metaDescription: 'Beskrivelse her til meta',
    });
    expect(patch['seo-title']).toBe('Titel');
    expect(patch['meta-description']).toBe('Beskrivelse her til meta');
    expect(Object.keys(patch).some((k) => k.startsWith('og'))).toBe(false);
  });

  it('marks OG/JSON-LD as generated_not_published', () => {
    const p = getCmsPublishability();
    expect(p.ogTitle).toBe('generated_not_published');
    expect(p.jsonLd).toBe('generated_not_published');
    expect(p.metaDescription).toBe('cms_writable');
  });
});

describe('seo-engine field path schemas', () => {
  it('rejects unknown fieldPath', () => {
    const r = parseFieldValue('metaKeywords', 'x');
    expect(r.ok).toBe(false);
  });

  it('accepts metaDescription string and supportingTopics array', () => {
    expect(parseFieldValue('metaDescription', 'En meta').ok).toBe(true);
    expect(parseFieldValue('supportingTopics', ['a', 'b']).ok).toBe(true);
    expect(parseFieldValue('supportingTopics', 'nope').ok).toBe(false);
  });
});

describe('seo-engine forbidden + validator invariants', () => {
  it('detects forbidden phrases', () => {
    expect(findForbiddenPhrases('Dette er et must-see').length).toBeGreaterThan(0);
  });

  it('demo pack validates without inventing search volumes', () => {
    const input = baseInput({
      body: `${'Tekst. '.repeat(40)}Afsluttende vurdering: filmen er for lang.`,
    });
    const norm = buildNormalizedInputText(input);
    const hash = computeInputVersionHash(input);
    const analysis = buildDemoAnalysis({
      input,
      normalizedText: norm.normalizedText,
      inputVersionHash: hash,
      inputMode: norm.inputMode,
    });
    expect(analysis.opportunities.entityLed[0]?.kind).toBe(
      'heuristic_editorial_opportunity'
    );
    const pack = buildDemoStrategyPack({ input, analysis });
    expect(pack.recommended.fields.metaDescription.value).toBeTruthy();
    expect(pack.cmsPublishability.jsonLd).toBe('generated_not_published');
    const v = validateSeoPack(pack, analysis);
    expect(Array.isArray(v.errors)).toBe(true);
    expect(Array.isArray(v.warnings)).toBe(true);
  });
});

describe('seo-engine job id contract', () => {
  it('builds provisional jobId as {itemId}_{locale}_{cmsLastUpdated}', () => {
    expect(buildProvisionalJobId('abc123', '2026-07-22T10:00:00.000Z')).toBe(
      'abc123_da_2026-07-22T10_00_00.000Z'
    );
    expect(buildProvisionalJobId('abc123', '2026-07-22T10:00:00.000Z', 'en')).toBe(
      'abc123_en_2026-07-22T10_00_00.000Z'
    );
  });

  it('sanitizes unsafe characters and caps length', () => {
    const id = buildProvisionalJobId('item', 'unsafe value/with spaces?');
    expect(id.startsWith('item_da_')).toBe(true);
    expect(id).not.toMatch(/[\s/?]/);
  });

  it('is deterministic for the same inputs (idempotent enqueue key)', () => {
    const a = buildProvisionalJobId('item-1', '2026-01-01T00:00:00.000Z', 'en');
    const b = buildProvisionalJobId('item-1', '2026-01-01T00:00:00.000Z', 'en');
    expect(a).toBe(b);
  });
});

describe('seo-engine empty-only patch invariants', () => {
  it('flags anyEmpty/bothEmpty correctly for fully empty CMS fields', () => {
    const empty = cmsSeoEmptiness({ 'seo-title': '', 'meta-description': null });
    expect(empty.seoTitleEmpty).toBe(true);
    expect(empty.metaDescriptionEmpty).toBe(true);
    expect(empty.anyEmpty).toBe(true);
    expect(empty.bothEmpty).toBe(true);
  });

  it('only reports the still-empty field when one is already filled', () => {
    const empty = cmsSeoEmptiness({
      'seo-title': 'Allerede udfyldt',
      'meta-description': '',
    });
    expect(empty.seoTitleEmpty).toBe(false);
    expect(empty.metaDescriptionEmpty).toBe(true);
    expect(empty.anyEmpty).toBe(true);
    expect(empty.bothEmpty).toBe(false);
  });

  it('never patches an already-filled field (empty-only write simulation)', () => {
    const empty = cmsSeoEmptiness({
      'seo-title': 'Allerede udfyldt',
      'meta-description': '',
    });
    const patchDomain: { seoTitle?: string; metaDescription?: string } = {};
    if (empty.seoTitleEmpty) patchDomain.seoTitle = 'Ny titel';
    if (empty.metaDescriptionEmpty) patchDomain.metaDescription = 'Ny meta';
    const cmsPatch = toWebflowSeoPatch(patchDomain);
    expect(cmsPatch['seo-title']).toBeUndefined();
    expect(cmsPatch['meta-description']).toBe('Ny meta');
  });

  it('produces an empty patch (skip write) when both fields are already filled', () => {
    const empty = cmsSeoEmptiness({
      'seo-title': 'Titel',
      'meta-description': 'Beskrivelse',
    });
    const patchDomain: { seoTitle?: string; metaDescription?: string } = {};
    if (empty.seoTitleEmpty) patchDomain.seoTitle = 'Ny titel';
    if (empty.metaDescriptionEmpty) patchDomain.metaDescription = 'Ny meta';
    expect(Object.keys(toWebflowSeoPatch(patchDomain)).length).toBe(0);
  });
});

describe('seo-engine field diff (history)', () => {
  it('only reports fields whose value actually changed', () => {
    const prev = {
      seoTitle: { value: 'A' },
      metaDescription: { value: 'M' },
    };
    const next = {
      seoTitle: { value: 'A' },
      metaDescription: { value: 'M2' },
    };
    const diffs = diffPublishFields(prev, next);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].fieldPath).toBe('metaDescription');
    expect(diffs[0].previous).toBe('M');
    expect(diffs[0].next).toBe('M2');
  });
});

describe('seo-engine article types + editor field order', () => {
  const requiredTypes = [
    'Filmanmeldelse',
    'Serieanmeldelse',
    'Koncertanmeldelse',
    'Festivalanmeldelse',
    'Albumanmeldelse',
    'Spilanmeldelse',
    'Teateranmeldelse',
    'Kunstanmeldelse',
    'Kulturkommentar',
    'Essay',
    'Interview',
    'Portræt',
    'Nyhed',
    'Guide',
    'Festivalguide',
    'Streamingguide',
    'Feature',
    'Rejseartikel',
    'Andet',
  ];

  it('ARTICLE_TYPE_OPTIONS includes the required Danish types', () => {
    for (const t of requiredTypes) {
      expect(ARTICLE_TYPE_OPTIONS).toContain(t);
    }
    // Extras kept for heuristics / legacy
    expect(ARTICLE_TYPE_OPTIONS).toContain('Anmeldelse');
  });

  it('EDITOR_FIELD_ORDER includes links + jsonLd and excludes checklist/risks', () => {
    expect(EDITOR_FIELD_ORDER).toContain('internalLinks');
    expect(EDITOR_FIELD_ORDER).toContain('externalLinks');
    expect(EDITOR_FIELD_ORDER).toContain('jsonLd');
    expect(EDITOR_FIELD_ORDER as readonly string[]).not.toContain('checklist');
    expect(EDITOR_FIELD_ORDER as readonly string[]).not.toContain('risks');
  });
});

describe('seo-engine demo analysis artist vs author', () => {
  it('does not map article author onto artist', () => {
    const input = baseInput({ author: 'Frederik Kragh' });
    const norm = buildNormalizedInputText(input);
    const hash = computeInputVersionHash(input);
    const analysis = buildDemoAnalysis({
      input,
      normalizedText: norm.normalizedText,
      inputVersionHash: hash,
      inputMode: norm.inputMode,
    });
    expect(analysis.artist).toBeUndefined();
  });
});

describe('seo-engine strategy adoption + locks', () => {
  function demoPack(over: Partial<SeoEngineInputContract> = {}) {
    const input = baseInput({
      body: `${'Tekst. '.repeat(40)}Afsluttende vurdering.`,
      existingSeoTitle: 'LOCKED CMS TITLE',
      existingMetaDescription: 'LOCKED CMS META',
      ...over,
    });
    const norm = buildNormalizedInputText(input);
    const hash = computeInputVersionHash(input);
    const analysis = buildDemoAnalysis({
      input,
      normalizedText: norm.normalizedText,
      inputVersionHash: hash,
      inputMode: norm.inputMode,
    });
    return { input, analysis, pack: buildDemoStrategyPack({ input, analysis }) };
  }

  it('promotes an alternative by id and demotes previous recommended', () => {
    const { pack } = demoPack();
    const altId = pack.alternatives[0]!.id;
    const prevRecommendedId = pack.recommended.id;
    const adopted = adoptAlternativeInPack(pack, altId);

    expect(adopted.recommendedStrategyId).toBe(altId);
    expect(adopted.recommended.id).toBe(altId);
    expect(adopted.recommended.family).toBe(pack.alternatives[0]!.family);
    expect(adopted.recommended.whyFits).toBe(pack.alternatives[0]!.whyFits);
    expect(adopted.alternatives.some((a) => a.id === prevRecommendedId)).toBe(true);
    expect(adopted.alternatives).toHaveLength(2);
    expect(adopted.alternatives.every((a) => a.id !== altId)).toBe(true);
  });

  it('rejects ids that are not among alternatives', () => {
    const { pack } = demoPack();
    expect(() => adoptAlternativeInPack(pack, 'not-a-real-id')).toThrow(/alternatives/i);
    expect(() => adoptAlternativeInPack(pack, pack.recommended.id)).toThrow(/allerede recommended/i);
  });

  it('preserves locked SEO title/meta on all directions after adoption', () => {
    const { pack } = demoPack();
    expect(pack.recommended.fields.seoTitle.locked).toBe(true);
    expect(pack.recommended.fields.seoTitle.value).toBe('LOCKED CMS TITLE');

    // Simulate an alternative that tried to bypass locks with different values
    const bypassPack = structuredClone(pack);
    bypassPack.alternatives[0]!.fields.seoTitle = {
      ...bypassPack.alternatives[0]!.fields.seoTitle,
      value: 'BYPASS TITLE FROM ALT',
      locked: false,
    };
    bypassPack.alternatives[0]!.fields.metaDescription = {
      ...bypassPack.alternatives[0]!.fields.metaDescription,
      value: 'BYPASS META FROM ALT',
      locked: false,
    };

    const adopted = adoptAlternativeInPack(bypassPack, bypassPack.alternatives[0]!.id);
    const allDirections = [adopted.recommended, ...adopted.alternatives];
    for (const dir of allDirections) {
      expect(dir.fields.seoTitle.locked).toBe(true);
      expect(dir.fields.seoTitle.value).toBe('LOCKED CMS TITLE');
      expect(dir.fields.metaDescription.locked).toBe(true);
      expect(dir.fields.metaDescription.value).toBe('LOCKED CMS META');
    }
  });
});
