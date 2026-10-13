export type SocialPublishFeedback = { success: string | null; warning: string | null; error: string | null };

/** Once sent, a missing response is not evidence that the post failed. Never retry automatically. */
export function uncertainSocialPublish(): SocialPublishFeedback {
  return { success: null, error: null, warning: 'Kvitteringen mangler. Opslaget kan være publiceret. Kontrollér Instagram og Facebook, før du sender igen, så du undgår et dobbeltopslag.' };
}

export function socialPublishFeedback(status: number, payload: unknown, isStory: boolean, hasArticleUrl: boolean): SocialPublishFeedback {
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (status < 200 || status >= 300) {
    // A transport/server timeout can occur after Meta accepted the request.
    if (status >= 500 || status === 408) return uncertainSocialPublish();
    return { success: null, warning: null, error: typeof data.error === 'string' && data.error.trim() ? data.error : 'Opslaget blev afvist. Kontrollér adgang og oplysninger.' };
  }
  if (data.success !== true || typeof data.mediaId !== 'string' || !data.mediaId.trim()) return uncertainSocialPublish();
  if (isStory) return { success: 'Story er publiceret på Instagram.', warning: null, error: null };
  const success = data.facebookPublished === true ? 'Publiceret på Instagram og Facebook.' : 'Publiceret på Instagram.';
  const warning = data.facebookPublished === true && data.facebookCommentPublished !== true && hasArticleUrl
    ? 'Artikellinket blev ikke lagt som første kommentar på Facebook. Tilføj linket manuelt; selve opslaget er publiceret.'
    : data.facebookPublished === false
      ? (typeof data.facebookError === 'string' && data.facebookError.trim() ? `Facebook: ${data.facebookError.trim()}` : 'Facebook-opslaget blev ikke bekræftet. Kontrollér Facebook før et nyt forsøg.')
      : null;
  return { success, warning, error: null };
}

/** Unknown/network errors must not be converted to "not configured". */
export function socialConfigured(status: number, payload: unknown): boolean | null {
  if (status !== 200 || !payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>).configured;
  return typeof value === 'boolean' ? value : null;
}
