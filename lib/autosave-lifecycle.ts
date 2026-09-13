/** Local-only lifecycle hook; cleanup removes listeners without writing. */
export function bindAutosaveLifecycle(flush: () => void) {
  const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', hidden);
  return () => {
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', hidden);
  };
}
