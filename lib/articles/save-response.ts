/** Safe client interpretation of new and legacy CMS-save responses. */
export function articleSaveFeedback(value: unknown): {
  articleId?: string; publicationVerified: boolean; label: string;
} {
  const envelope = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const data = envelope.data && typeof envelope.data === 'object'
    ? envelope.data as Record<string, unknown> : envelope;
  const articleId = typeof data.articleId === 'string' && /^[a-f0-9]{24}$/i.test(data.articleId)
    ? data.articleId : undefined;
  const publicationVerified = envelope.success === true && !!articleId &&
    data.publicationVerified === true && data.webflowStatus === 'published';
  const label = publicationVerified ? 'Publiceret og verificeret'
    : data.saveVerified === true && data.saveState === 'draft' ? 'Kladde gemt'
    : data.saveVerified === true && data.saveState === 'staged' ? 'Ændringer gemt, ikke bekræftet live'
    : 'Gemning ikke verificeret';
  return { articleId, publicationVerified, label };
}
