/** An empty editorial aid, never an assertion that attendance or an experience is verified. */
export const colleagueNotesTemplate = `KOLLEGANOTER
Kollega og ønsket byline: [udfyld]
Arrangement/værk, dato og set omfang: [udfyld]
Konkrete observationer: [udfyld]
Egen reaktion og vurdering: [udfyld]
Hvilke konkrete oplevelser har kollegaen bekræftet? [udfyld]
Mangler eller usikkerheder: [udfyld]
`;

export function appendColleagueNotes(notes: string): string {
  if (notes.includes('KOLLEGANOTER')) return notes;
  return [notes.trimEnd(), colleagueNotesTemplate].filter(Boolean).join('\n\n');
}

/** The new chat message is sent separately. Never trim away a colleague's evidence. */
export function mergeWriterBrief(notes: string, message: string): string {
  if (notes.includes('KOLLEGANOTER')) return notes;
  return [notes, message].filter(segment => segment.trim().length > 0).join('\n\n').slice(-2000);
}
