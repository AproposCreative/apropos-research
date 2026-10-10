import { createContext, runInContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { articleWidgetHtml } from '@/lib/mcp/article-widget';

// Execute the actual embedded receiver, not a second implementation. No browser,
// credentials, network, personal clicks or paid providers are involved.
function widget() {
  const receive = articleWidgetHtml.slice(articleWidgetHtml.indexOf('function receive('), articleWidgetHtml.indexOf('function render('));
  const context = createContext({ render: vi.fn() });
  runInContext('let data=null, confirmation=null, imagePreviews={};\n' + receive, context);
  return {
    receive: (revision: number, at?: string, status = 'awaiting_preparation', id = 'one') => {
      context.result = { structuredContent: { submissionId: id, revision, status, previewReadAt: at }, _meta: { confirmation: { token: `rev-${revision}` } } };
      runInContext('receive(result)', context);
    },
    read: () => runInContext('({data,confirmation})', context),
    clear: () => runInContext('confirmation=null', context),
  };
}
it('does not let a replayed old host card overwrite a refreshed article or its confirmation', () => {
  const w = widget(); w.receive(1); w.receive(5, '2026-10-10T18:00:00Z');
  w.receive(1); expect(w.read().data.revision).toBe(5); expect(w.read().confirmation.token).toBe('rev-5');
  w.receive(6, '2026-10-10T17:59:59Z'); expect(w.read().data.revision).toBe(6);
});
it('keeps the newest same-revision status and refuses another submission or a missing clock', () => {
  const w = widget(); w.receive(5, '2026-10-10T18:00:00Z', 'prepared');
  w.receive(5, '2026-10-10T18:00:01Z', 'scheduled');
  w.receive(5, '2026-10-10T18:00:00Z', 'prepared'); w.receive(5); w.receive(8, '2026-10-10T18:00:02Z', 'published', 'other');
  expect(w.read().data.status).toBe('scheduled'); expect(w.read().data.submissionId).toBe('one');
});
it('does not resurrect a consumed or failed-image confirmation on duplicate host notification', () => {
  const w = widget(); w.receive(5, '2026-10-10T18:00:00Z'); w.clear();
  w.receive(5, '2026-10-10T18:00:00Z'); expect(w.read().confirmation).toBeNull();
  w.receive(5, '2026-10-10T18:00:01Z'); expect(w.read().confirmation).not.toBeNull();
});
