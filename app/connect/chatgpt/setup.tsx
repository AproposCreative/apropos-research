'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { MCP_RESOURCE } from '@/lib/mcp/config';
import type { ConnectionStatus } from '@/lib/mcp/connections';

const button = 'min-h-12 rounded-xl border border-white/20 px-4 py-3 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';
export default function ConnectionSetup() {
  const { user } = useAuth();
  const address = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState(false), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController(); let active = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setLoading(true); setError(false); setStatus(null);
    (async () => {
      const response = await fetch('/oauth/connections', { headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw Error('unavailable');
      const data: ConnectionStatus = await response.json();
      if (active) setStatus(data);
    })().catch(() => { if (active) setError(true); }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [user, refresh]);

  async function copyAddress() {
    setCopied(false); setCopyError(false);
    try { await navigator.clipboard.writeText(MCP_RESOURCE); setCopied(true); }
    catch { address.current?.focus(); address.current?.select(); setCopyError(true); }
  }
  return <>
    <p>Forbind Apropos én gang. Derefter kan du hente Livs kladder og arbejde med dem i din ChatGPT-samtale.</p>
    <ol className="list-decimal space-y-3 pl-5 text-white/75">
      <li>Åbn ChatGPT på computeren. Vælg Indstillinger → Security and login → Developer mode.</li>
      <li>Åbn Plugins, tryk +, og kald forbindelsen Apropos. Indsæt adressen nedenfor.</li>
      <li>Vælg OAuth. Vælg automatisk klientregistrering (DCR), hvis du bliver spurgt. Du skal ikke indsætte en API-nøgle.</li>
      <li>Log ind med frederik@aproposmagazine.com, og godkend adgangen.</li>
    </ol>
    <div>
      <label className="block text-sm text-white/65" htmlFor="mcp-address">MCP-adresse</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id="mcp-address" ref={address} readOnly value={MCP_RESOURCE} className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/20 bg-transparent p-3 text-sm text-white" onFocus={event => event.target.select()} />
        <button type="button" onClick={copyAddress} className={button}>{copied ? 'Kopieret' : 'Kopiér adresse'}</button>
      </div>
      <p role="status" className="mt-2 text-sm text-white/65">{copyError ? 'Adressen er markeret. Kopiér den manuelt.' : copied ? 'MCP-adressen er kopieret.' : ''}</p>
    </div>
    <div className="border-t border-white/15 pt-4">
      <div role="status" aria-live="polite" aria-atomic="true">
        <p>{loading ? 'Kontrollerer forbindelsen …' : error ? 'Status kunne ikke hentes' : status?.authorization === 'none' ? 'Ingen adgang godkendt endnu' :
          status?.authorization === 'granted' ? status.successfulToolCallObserved ? 'Værktøjskald registreret' : 'Adgang godkendt' : 'Forbindelsen er ikke bekræftet'}</p>
        <p className="mt-2 text-sm leading-relaxed text-white/65">{error ? 'Din adgang er ikke ændret. Prøv statuskontrollen igen.' :
          status?.successfulToolCallObserved ? 'Apropos har besvaret et værktøjskald med denne adgang. Det bekræfter ikke en redigering eller publicering.' :
          'Åbn en ny chat, vælg Apropos i værktøjsmenuen, og skriv: “Vis Livs seneste kladder og deres blokeringer. Ret eller publicér ikke noget.”'}</p>
      </div>
      <button type="button" className={`${button} mt-3`} disabled={loading} onClick={() => setRefresh(value => value + 1)}>Kontrollér forbindelse</button>
    </div>
    <p className="text-sm leading-relaxed text-white/55">Developer mode afhænger af din konto og arbejdsområdets regler. <a className="underline underline-offset-4" href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer">Se OpenAI’s vejledning</a>. Abonnementets grænser gælder stadig. Denne forbindelse bestiller ikke betalt AI.</p>
  </>;
}
