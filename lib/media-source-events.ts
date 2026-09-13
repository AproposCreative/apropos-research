export const MEDIA_SOURCES_CHANGED = 'apropos:media-sources-changed';
export function notifyMediaSourcesChanged(uid: string) {
  window.dispatchEvent(new CustomEvent(MEDIA_SOURCES_CHANGED, { detail: { uid } }));
}
