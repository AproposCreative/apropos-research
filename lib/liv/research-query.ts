/** Separate a searchable subject from the editor's angle. Keep the full brief for writing. */
export function livResearchQueries(title: string): [string, string] {
  // Do not truncate real work titles such as "Star Wars: A New Hope".
  const subject = title.trim().split(/(?:\s+[–—]\s+|:\s+)(?=(?:når|hvorfor|hvordan|hvad|derfor)\b)/iu)[0].trim().slice(0, 180);
  if (!subject) throw new Error('research_query_missing');
  return [subject, `${subject} anmeldelse review`];
}
