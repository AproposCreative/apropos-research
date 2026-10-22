'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { mailWidgetHtml } from '@/lib/mcp/mail-widget';
import { mountMailReviewBridge } from '@/lib/editorial-mail/review-bridge';

/** Uses the same actual preview, signature and confirmation button as MCP. */
export default function MailReview({ draftId }: { draftId: string }) {
  const { user, capabilities } = useAuth();
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user || !capabilities.owner || !frame.current) return;
    const mounted = frame.current;
    const dispose = mountMailReviewBridge({ frame: mounted, draftId, onError: setError,
      call: async (name, input) => {
        const response = await fetch('/oauth/mail-review', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
          body: JSON.stringify({ draftId, name, input }) });
        const result = await response.json();
        if (!response.ok) throw Error(`Mailhandlingen kunne ikke bekræftes (${result.error || 'forbindelsesfejl'}). Genindlæs previewet; send ikke igen ved ukendt afsendelsesstatus.`);
        return result;
      } });
    // Install the host before the iframe initializes; never inject mail or tokens into HTML.
    mounted.srcdoc = mailWidgetHtml;
    return () => { dispose(); mounted.srcdoc = ''; };
  }, [user, capabilities.owner, draftId]);
  if (!capabilities.owner) return <p>Denne private mailvisning er kun tilgængelig for Frederik.</p>;
  return <>
    {error ? <p role="alert" className="rounded-xl border border-red-400/40 p-4 text-red-200">{error}</p> : null}
    <iframe ref={frame} title="Privat Apropos-mailpreview" sandbox="allow-scripts" referrerPolicy="no-referrer" className="w-full border-0" style={{ height: 1000 }} />
    <p className="text-sm text-white/60">Intet sendes ved at åbne linket. Kun dit personlige klik på “Godkend og send” sender den viste mailversion.</p>
  </>;
}
