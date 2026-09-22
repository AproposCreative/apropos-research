import { expect, it } from 'vitest';
import { appendColleagueNotes, colleagueNotesTemplate, mergeWriterBrief } from '@/lib/editorial/colleague-notes';
import { buildPromptSegments, composeSystemPrompt } from '@/lib/ai-chat/build-system-prompt';
import { workspacePayloadSchema } from '@/lib/writer-workspace';

it('adds a blank template once and preserves existing observations', () => {
  const original = 'Casper: lyden druknede vokalen.';
  const notes = appendColleagueNotes(original);
  expect(notes).toContain(original);
  expect(notes).toContain('[udfyld]');
  expect(appendColleagueNotes(notes)).toBe(notes);
  expect(appendColleagueNotes('')).toBe(colleagueNotesTemplate);
});

it('keeps notes in the existing workspace and prompt without declaring them verified', () => {
  const notes = appendColleagueNotes('Milo har bekræftet gåsehud under ekstranummeret.');
  const saved = workspacePayloadSchema.parse({ notes, messages: [], chatTitle: 'Koncert', articleData: {}, showWizard: false, currentDraftId: null });
  const prompt = composeSystemPrompt(buildPromptSegments('Milos stemme', 'Milo', {}, saved.notes), {}, null);
  expect(prompt).toContain(notes.trim());
  expect(prompt).toContain('vedkommendes byline');
  expect(prompt).toContain('skabelon er ikke evidens');
  expect(prompt).toContain('ikke blive til Livs påståede tilstedeværelse');
  expect(prompt).toContain('må ikke selv udfylde manglende bekræftelse');
});

it('does not let later chat briefs truncate colleague provenance', () => {
  const notes = appendColleagueNotes('Milo: ' + 'konkret observation '.repeat(200));
  expect(mergeWriterBrief(notes, 'Skriv nu anmeldelsen')).toBe(notes);
  expect(mergeWriterBrief('Kort brief', 'Ny vinkel')).toBe('Kort brief\n\nNy vinkel');
  expect(mergeWriterBrief('x'.repeat(3000), 'Ny vinkel')).toHaveLength(2000);
});
