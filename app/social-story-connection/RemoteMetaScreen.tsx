'use client';
import { useEffect, useRef, useState } from 'react';

export type RemoteInput = { type: 'text'; text: string } | { type: 'key'; key: string } |
  { type: 'click'; x: number; y: number } | { type: 'scroll'; x: number; y: number; deltaY: number };
const keys = new Set(['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const point = (x: number, y: number, element: HTMLElement) => {
  const r = element.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1650, (x-r.left)/r.width*1650)), y: Math.max(0, Math.min(1045, (y-r.top)/r.height*1045)) };
};

/** Only transient human input. No password state, storage, analytics or replay. */
export default function RemoteMetaScreen({ screenshot, disabled, onEvents }: {
  screenshot: string; disabled: boolean; onEvents: (events: RemoteInput[]) => void;
}) {
  const paste = useRef<HTMLTextAreaElement>(null), queue = useRef<RemoteInput[]>([]);
  const [hasText, setHasText] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const screen = useRef<HTMLButtonElement>(null);
  const send = useRef(onEvents); send.current = onEvents;
  const flush = () => {
    clearTimeout(timer.current); timer.current = undefined;
    const events = queue.current; queue.current = [];
    if (events.length) send.current(events);
  };
  const push = (event: RemoteInput) => {
    if (disabled) return;
    const previous = queue.current.at(-1);
    if (event.type === 'text' && previous?.type === 'text' && previous.text.length + event.text.length <= 2000) previous.text += event.text;
    else {
      if (queue.current.length >= 20 || event.type === 'text') flush();
      queue.current.push(event);
    }
    clearTimeout(timer.current); timer.current = setTimeout(flush, 65);
  };
  useEffect(() => () => { clearTimeout(timer.current); queue.current = []; }, []);
  useEffect(() => { if (disabled) { clearTimeout(timer.current); queue.current = []; } }, [disabled]);
  const pushEvent = useRef(push); pushEvent.current = push;
  useEffect(() => {
    const element = screen.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY) pushEvent.current({ type: 'scroll', ...point(event.clientX, event.clientY, element), deltaY: Math.max(-1045, Math.min(1045, event.deltaY)) });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const insert = () => {
    const value = paste.current?.value || '';
    if (!value || disabled) return;
    if (paste.current) paste.current.value = '';
    setHasText(false); flush();
    // Explicit transfer only. A browser/extension suggestion must never be
    // forwarded automatically, and an existing wrong value is replaced.
    send.current([{ type: 'key', key: 'Control+A' }, { type: 'text', text: value }]);
  };
  return <>
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', margin: '12px 0' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        {/* A generic textarea avoids the local password manager. Actual text is
            transparent in every browser; a fixed mask is drawn separately. */}
        <textarea ref={paste} rows={1} maxLength={2000} disabled={disabled} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          data-1p-ignore data-lpignore="true" data-form-type="other" aria-label="Indsæt tekst til det valgte Meta-felt"
          placeholder="Indsæt tekst her"
          style={{ display: 'block', resize: 'none', width: '100%', minHeight: 46, boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1px solid #555', background: '#1c1c1e', color: 'transparent', caretColor: '#fff', font: 'inherit' }}
          onChange={event => setHasText(!!event.currentTarget.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); insert(); } }} />
        {hasText && <span aria-hidden="true" style={{ pointerEvents: 'none', position: 'absolute', left: 14, top: 12, color: '#fff' }}>••••••••</span>}
      </div>
      <button type="button" disabled={disabled || !hasText} onClick={insert} title="Erstat indholdet i det valgte Meta-felt"
        style={{ minHeight: 46, padding: '8px 18px', borderRadius: 12, border: '1px solid #38383a', background: '#1c1c1e', color: '#0a84ff', font: 'inherit' }}>Indsæt</button>
    </div>
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #333' }}>
    <button ref={screen} type="button" disabled={disabled} aria-label="Meta-login på serveren. Klik på feltet, du vil udfylde."
      style={{ display: 'block', width: '100%', padding: 0, border: 0, background: '#fff', cursor: 'text' }}
      onClick={event => {
        event.currentTarget.focus({ preventScroll: true });
        if (event.detail) push({ type: 'click', ...point(event.clientX, event.clientY, event.currentTarget) });
      }}
      onBlur={flush}
      onPaste={event => {
        event.preventDefault(); const text = event.clipboardData.getData('text/plain');
        if (text && text.length <= 2000) push({ type: 'text', text });
      }}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault(); push({ type: 'key', key: 'Control+A' });
        } else if (event.key === 'Escape') {
          event.preventDefault(); push({ type: 'key', key: 'Escape' }); event.currentTarget.blur();
        } else if (event.key === 'Tab') {
          // Keep normal tab order. Mobile and keyboard users can always reach
          // the explicit paste control without being trapped in a hidden input.
          flush();
        } else if (keys.has(event.key)) {
          event.preventDefault(); push({ type: 'key', key: event.key === 'Tab' && event.shiftKey ? 'Shift+Tab' : event.key });
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault(); push({ type: 'text', text: event.key });
        }
      }}>
      <img src={'data:image/jpeg;base64,'+screenshot} alt="Metas login-side i serverbrowseren" draggable={false} style={{ display: 'block', width: '100%' }} />
    </button>
    </div>
  </>;
}
