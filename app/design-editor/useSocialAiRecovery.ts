'use client';

import { useEffect } from 'react';
import { auth } from '@/lib/firebase';

const RESUMED_EVENT = 'apropos-social-ai-resumed';
export function notifySocialAiResumed() {
  window.dispatchEvent(new Event(RESUMED_EVENT));
}

/** Only a newer, already authorized server generation clears a quota error.
 * Focus/events trigger read-only checks, never a budget reset or blind retry. */
export function useSocialAiRecovery(failedGeneration: number | undefined, onRecovered: (generation: number) => void, contextKey: string) {
  useEffect(() => {
    if (!Number.isSafeInteger(failedGeneration) || failedGeneration! < 0) return;
    const controller = new AbortController();
    let busy = false;
    const check = async () => {
      if (busy || controller.signal.aborted || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        await auth?.authStateReady();
        const token = await auth?.currentUser?.getIdToken();
        if (!token || controller.signal.aborted) return;
        const response = await fetch('/api/design-editor/subtitle-status', {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) return;
        const status = await response.json();
        if (!controller.signal.aborted && status.blocked === false && Number.isSafeInteger(status.generation) &&
          status.generation > failedGeneration!) onRecovered(status.generation);
      } catch { /* Preserve the failure when current status cannot be verified. */ }
      finally { busy = false; }
    };
    void check();
    const changed = () => { void check(); };
    window.addEventListener('focus', changed);
    window.addEventListener('pageshow', changed);
    window.addEventListener(RESUMED_EVENT, changed);
    document.addEventListener('visibilitychange', changed);
    return () => {
      controller.abort();
      window.removeEventListener('focus', changed);
      window.removeEventListener('pageshow', changed);
      window.removeEventListener(RESUMED_EVENT, changed);
      document.removeEventListener('visibilitychange', changed);
    };
  }, [failedGeneration, onRecovered, contextKey]);
}
