import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: null }) }));
import { MetadataQualityView } from '../../../components/seo/MetadataQualityPanel';
const common = { rows: [], health: null, cursor: null, busy: false, error: null,
  authenticated: true, refresh: () => {}, toggleLock: () => {} };
it('renders unknown health explicitly and successful metadata without an error fallback', () => {
  const row = { id: '1', title: 'Testartikel', locale: 'da', status: 'applied', reason: 'chatgpt_metadata_public_verified',
    updatedAt: '2026-10-11T13:00:00Z', mode: 'publication_quality', processor: 'chatgpt-first', editorialRecheck: true,
    before: { seoTitle: 'Titel', metaDescription: 'Før' }, after: { seoTitle: 'Titel', metaDescription: 'Efter' },
    proposed: { metaDescription: 'Efter' }, assessments: [], lockedFields: [], publicReceipt: { url: 'https://www.aproposmagazine.com/articles/test' } } as any;
  const html = renderToStaticMarkup(createElement(MetadataQualityView, { ...common, rows: [row] }));
  expect(html).toContain('Driftsstatus er ikke tilgængelig'); expect(html).toContain('Verificeret live');
  expect(html).toContain('Verificeret offentligt'); expect(html).not.toContain('Fejldetaljer');
  expect(html).not.toContain('Kontrollen kunne ikke gennemføres'); expect(html).toContain('Ikke et uafhængigt serverfaktatjek');
});
it('shows a missing run as unknown cause, not a fabricated access or model failure', () => {
  const health = { processor: 'chatgpt-first', day: '2026-10-12', status: 'attention', checkedAt: '2026-10-12T08:05:00Z',
    completedTasks: 0, issues: [{ code: 'scheduled_run_not_observed' }], scanPartial: true } as any;
  const html = renderToStaticMarkup(createElement(MetadataQualityView, { ...common, health }));
  expect(html).toContain('Kræver opfølgning'); expect(html).toContain('årsagen er endnu ukendt');
  expect(html).toContain('ikke en fuld kontrol'); expect(html).not.toContain('adgangen er udløbet');
});
