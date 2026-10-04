'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

type Proposal = { proposalId: string; itemId: string; candidateHash: string; title: string; intro?: string;
  beforeWords: number; afterWords: number; originalParagraphs: string[]; proposedParagraphs: string[];
  currentVersionMatches: boolean; reviewed: boolean; status: string };
const button = 'min-h-12 rounded-xl border border-white/20 px-5 py-3 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';
const endpoint = '/oauth/shortening';

export default function ShorteningConfirmation({ proposalId }: { proposalId: string }) {
  const { user, capabilities } = useAuth();
  const getToken = useCallback(async () => { if (!user) throw Error('login_required'); return user.getIdToken(); }, [user]);
  if (!user || !capabilities.owner) return null;
  return <Review key={`${user.uid}:${proposalId}`} proposalId={proposalId} getToken={getToken} />;
}
function Review({ proposalId, getToken }: { proposalId: string; getToken: () => Promise<string> }) {
  const [proposal, setProposal] = useState<Proposal | null>(null), [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const busy = useRef(false), epoch = useRef(0), request = useRef<AbortController | null>(null);
  const call = useCallback(async (body?: object) => {
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const token = await getToken(); if (controller.signal.aborted) throw Error('cancelled');
      const response = await fetch(body ? endpoint : `${endpoint}?proposalId=${encodeURIComponent(proposalId)}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw Error('unconfirmed'); return await response.json();
    } finally { clearTimeout(timer); if (request.current === controller) request.current = null; }
  }, [getToken, proposalId]);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    const current = epoch.current; busy.current = true; setLoading(true); setError(''); setChecked(false);
    try {
      const data = await call() as Proposal;
      if (current !== epoch.current) return;
      if (data.proposalId !== proposalId || !/^[a-f0-9]{64}$/.test(data.candidateHash) || typeof data.title !== 'string' ||
        !Array.isArray(data.proposedParagraphs) || !Array.isArray(data.originalParagraphs) ||
        ![...data.proposedParagraphs, ...data.originalParagraphs].every(value => typeof value === 'string')) throw Error('invalid');
      setProposal(data);
    } catch { if (current === epoch.current) { setProposal(null); setError('Forslaget kunne ikke hentes. Prøv det samme link igen; der bestilles ikke en ny tekst.'); } }
    finally { if (current === epoch.current) { busy.current = false; setLoading(false); } }
  }, [call, proposalId]);
  useEffect(() => {
    epoch.current++; busy.current = false; void refresh();
    return () => { epoch.current++; request.current?.abort(); };
  }, [refresh]);
  async function approve() {
    if (!proposal || !checked || !proposal.currentVersionMatches || proposal.reviewed || busy.current) return;
    const current = epoch.current; busy.current = true; setLoading(true); setError('');
    try {
      const result = await call({ proposalId, candidateHash: proposal.candidateHash, reviewedFactsAndMeaning: true });
      if (current !== epoch.current) return;
      if (result.status !== 'shortening_review_recorded' || result.candidateHash !== proposal.candidateHash ||
        result.itemId !== proposal.itemId || result.cmsChanged !== false) throw Error('unconfirmed');
      setProposal({ ...proposal, reviewed: true, status: 'reviewed' });
    } catch { if (current === epoch.current) setError('Godkendelsen kunne ikke bekræftes. Kontrollér status på det samme forslag før du prøver igen.'); }
    finally { if (current === epoch.current) { busy.current = false; setLoading(false); } }
  }
  return <section aria-label="Godkend forkortelse" className="space-y-5">
    <p className="text-sm leading-6 text-white/65">Forslaget er skrevet i ChatGPT. Billeder, links og metadata bevares. Du godkender kun forkortelsen her, ikke udgivelsen.</p>
    {proposal && <>
      <h2 className="break-words text-2xl">{proposal.title}</h2>
      <p className="text-sm text-white/65">{proposal.beforeWords} ord bliver til {proposal.afterWords} ord.</p>
      {proposal.intro && <p className="break-words leading-7 text-white/75">{proposal.intro.replace(/<[^>]*>/g, ' ')}</p>}
      <div aria-label="Forkortet tekst" className="space-y-4 break-words text-base leading-7">
        {proposal.proposedParagraphs.map((text, index) => <p key={index}>{text}</p>)}
      </div>
      <details className="border-t border-white/15 pt-4"><summary className="cursor-pointer py-2">Se originalen</summary>
        <div className="space-y-4 break-words py-4 text-sm leading-7 text-white/65">
          {proposal.originalParagraphs.map((text, index) => <p key={index}>{text}</p>)}
        </div>
      </details>
      {proposal.status === 'staged' ? <p role="status">Forkortelsen har en gemmekvittering i CMS. Det er ikke en bekræftet udgivelse. Gå tilbage til ChatGPT for næste trin.</p>
        : proposal.status === 'save_unconfirmed' ? <p role="status">Gemningen mangler bekræftelse. Bed ChatGPT kontrollere det samme forslag; opret ikke et nyt.</p>
        : proposal.reviewed ? <p role="status">Din godkendelse er gemt. Gå tilbage til ChatGPT, og bed den gemme dette forslag i kladden. Artiklen er ikke publiceret.</p>
        : proposal.currentVersionMatches ? <>
          <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checked} disabled={loading}
            onChange={event => setChecked(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" />Jeg har læst den forkortede tekst og kontrolleret fakta og mening.</label>
          <button type="button" className={`${button} w-full bg-white/10`} disabled={!checked || loading} onClick={approve}>Godkend denne forkortelse</button>
        </> : <p role="alert">Artiklen er ændret eller kan ikke kontrolleres nu. Forslaget er bevaret, men kan ikke godkendes. Genindlæs status før næste trin.</p>}
    </>}
    {loading && <p role="status" className="text-sm text-white/65">Kontrollerer det gemte forslag …</p>}
    {error && <p role="alert" className="rounded-xl border border-red-400/40 p-4 text-red-200">{error}</p>}
    <button type="button" disabled={loading} className={button} onClick={() => void refresh()}>Kontrollér status igen</button>
  </section>;
}
