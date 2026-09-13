import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Architectural invariant: only the Writer parent may restore or persist the
// workspace. The chat view must not silently restore a title on mount.
it('keeps the chat panel free of its obsolete independent workspace store', () => {
  const panel = readFileSync('app/ai/MainChatPanel.tsx', 'utf8');
  expect(panel).not.toContain('localStorage.getItem(');
  expect(panel).not.toContain('localStorage.setItem(');
  expect(panel).not.toContain('setLastSaved');
  expect(panel).not.toContain('autoSaveTimeoutRef');
});
it('shows the authoritative parent workspace status rather than a local timer timestamp', () => {
  const writer = readFileSync('app/ai/AIWriterClient.tsx', 'utf8');
  const panel = readFileSync('app/ai/MainChatPanel.tsx', 'utf8');
  expect(writer).toContain('workspaceStatus={workspace.status}');
  expect(panel).toContain('role="status"');
  expect(panel).toContain('{workspaceStatus}');
});
