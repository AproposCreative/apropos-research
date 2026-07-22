import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Settings OPTIMERING SEO placement', () => {
  it('SettingsPanel renders one Optimering heading with SEO before image opt', () => {
    const src = readFileSync(
      join(process.cwd(), 'components/SettingsPanel.tsx'),
      'utf8'
    );
    const optIdx = src.indexOf('Optimering');
    const seoIdx = src.indexOf('<SeoEngineSection');
    const imgIdx = src.indexOf('<ImageOptimizationSection');
    const trIdx = src.indexOf('<ArticleTranslationSection');
    expect(optIdx).toBeGreaterThan(-1);
    expect(seoIdx).toBeGreaterThan(optIdx);
    expect(imgIdx).toBeGreaterThan(seoIdx);
    expect(trIdx).toBeGreaterThan(imgIdx);
    expect(src).toContain('showHeading={false}');
  });

  it('SeoEngineSection uses editor copy + Scan/Kør + open engine link', () => {
    const src = readFileSync(
      join(process.cwd(), 'components/settings/SeoEngineSection.tsx'),
      'utf8'
    );
    expect(src).toContain('SEO-optimering');
    expect(src).toContain('Auto-SEO');
    expect(src).toContain('Slået til');
    expect(src).toContain('Slået fra');
    expect(src).toContain("'/api/seo-engine/preview'");
    expect(src).toContain("'/api/seo-engine/run'");
    expect(src).toContain('scanId');
    expect(src).toContain('candidates');
    expect(src).toContain('/ai?view=seo');
    expect(src).toContain('Åbn SEO Engine');
    expect(src).toContain('window.confirm');
    expect(src).toContain('role="switch"');
  });

  it('preview and run API routes exist with auth gates and scan binding', () => {
    const preview = readFileSync(
      join(process.cwd(), 'app/api/seo-engine/preview/route.ts'),
      'utf8'
    );
    const run = readFileSync(join(process.cwd(), 'app/api/seo-engine/run/route.ts'), 'utf8');
    expect(preview).toContain('requireSeoEngineUser');
    expect(run).toContain('requireSeoEngineAdmin');
    expect(run).toContain('runAutoSeoBatch');
    expect(run).toContain('scanId');
    expect(run).toContain('candidates');
  });
});
