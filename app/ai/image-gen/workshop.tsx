'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { User } from 'firebase/auth';
import { useAuth } from '@/lib/auth-context';
import type { ImageGenArticle, ImageGenMotif } from '@/lib/image-gen/article';
import type { ImageGenJob } from '@/lib/image-gen/jobs';
import type { ImageGenAsset } from '@/lib/image-gen/runtime';
import type { ImageGenPressCandidate } from '@/lib/image-gen/press';
import type { ImageGenSelection } from '@/lib/image-gen/draft';
import styles from './workshop.module.css';
import StyleSettings from './style-settings';

type ArticleRow = { id: string; title: string; cover: string | null; isDraft: boolean };
type Snapshot = { article: ImageGenArticle; cover: { url?: string } | null; isDraft: boolean; existingImages?: { url: string; alt: string; caption: string }[] };
type Quote = { id: string; estimateUpToDkk: number };
type Ideas = { motifs: ImageGenMotif[]; textVersion?: string; press?: { candidates: ImageGenPressCandidate[]; status: string } };
const money = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 2 });
const statusName: Record<string, string> = { running: 'Arbejder · du kan lukke siden', succeeded: 'Gemt', uncertain: 'Resultatet skal kontrolleres. Ingen automatisk genbestilling.', 'failed-before-provider': 'Stoppet før aflevering. Kontrollér indstillinger eller opdatér artiklen.' };

export default function ImageGenWorkshop({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const { user, loading, capabilities } = useAuth();
  if (loading) return <main className={embedded ? styles.embeddedShell : styles.shell}>Indlæser …</main>;
  if (!user) return <main className={embedded ? styles.embeddedShell : styles.shell}><Link href="/ai">Log ind på Apropos AI</Link></main>;
  // Switching account unmounts all private working state and object URLs.
  return <Workshop key={user.uid} user={user} owner={capabilities?.owner === true} embedded={embedded} onClose={onClose} />;
}

function Workshop({ user, owner, embedded, onClose }: { user: User; owner: boolean; embedded: boolean; onClose?: () => void }) {
  const [rows, setRows] = useState<ArticleRow[]>([]), [query, setQuery] = useState(''), [cursor, setCursor] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [jobs, setJobs] = useState<ImageGenJob[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({}), [budget, setBudget] = useState('Henter separat billedbudget …');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), working = useRef(false);
  const [motif, setMotif] = useState<ImageGenMotif | null>(null), [style, setStyle] = useState('expressive');
  const [selected, setSelected] = useState<ImageGenSelection[]>([]), [previewId, setPreviewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null), [editText, setEditText] = useState('');
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false), [workspaceSaved, setWorkspaceSaved] = useState('');
  const revision = useRef(0), saveTail = useRef<Promise<unknown>>(Promise.resolve());
  const alive = useRef(true);
  const request = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(`/api/image-gen/${path}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Handlingen kunne ikke gennemføres.');
    return data;
  }, [user]);
  const refreshJobs = useCallback(async () => {
    const data = await request('jobs'); if (alive.current) {
      setJobs(previous => [...data.jobs, ...previous.filter(j => !data.jobs.some((next: ImageGenJob) => next.id === j.id))]);
      setHistoryCursor(data.nextCursor ?? null);
    }
  }, [request]);
  const refreshBudget = useCallback(async () => {
    const [b, q] = await Promise.allSettled([request('budget'), request('quotes')]);
    if (!alive.current) return;
    if (q.status === 'fulfilled') setQuotes(q.value.quotes);
    if (b.status === 'fulfilled' && b.value.status === 'ready') {
      setBudget(`${money(b.value.estimatedDkk)} kr. estimeret + ${money(b.value.reservedDkk)} kr. reserveret / ${money(b.value.monthlyLimitDkk)} kr. pr. måned`);
    } else setBudget('Billedbudgettet er ikke klar. Der kan ikke startes betalte kald.');
  }, [request]);
  const act = async (work: () => Promise<void>) => {
    if (working.current) return; working.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Der opstod en fejl.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  const search = async (offset = 0) => {
    const data = await request(`articles?q=${encodeURIComponent(query)}&cursor=${offset}`);
    if (!alive.current) return;
    setRows(previous => offset ? [...previous, ...data.articles.filter((row: ArticleRow) => !previous.some(p => p.id === row.id))] : data.articles);
    setCursor(data.nextCursor);
  };
  const open = async (id: string) => {
    const data = await request(`articles?id=${id}`);
    if (!alive.current) return;
    setSnapshot(data); setMotif(null); setSelected([]); setPreviewId(null); setEditId(null);
  };
  useEffect(() => {
    alive.current = true;
    void Promise.all([request('articles').then(data => { if (alive.current) { setRows(data.articles); setCursor(data.nextCursor); } }),
      refreshJobs(), refreshBudget(), request('workspace').then(async data => {
        revision.current = data.revision;
        const s = data.state;
        if (s?.articleId && /^[a-f0-9]{24}$/.test(s.articleId)) {
          const current = await request(`articles?id=${s.articleId}`);
          if (!alive.current) return;
          setSnapshot(current);
          if (current.article.version === s.articleVersion) {
            setMotif(s.motif ?? null); setSelected(s.selected ?? []); setEditId(s.editId ?? null); setEditText(s.editText ?? '');
          }
        }
        if (!alive.current) return;
        if (['minimal', 'expressive'].includes(s?.style)) setStyle(s.style);
        setPending(s?.pending ?? null); setWorkspaceReady(true);
      })]).catch(() => { if (alive.current) setError('Kunne ikke hente værkstedet. Prøv at genindlæse.'); });
    return () => { alive.current = false; };
  }, [request, refreshJobs, refreshBudget]);
  const saveWorkspace = useCallback((state: unknown) => {
    const task = saveTail.current.then(async () => {
      const result = await request('workspace', { revision: revision.current, state });
      revision.current = result.revision;
      if (alive.current) setWorkspaceSaved('Arbejdsvalg gemt privat');
    });
    // A conflict is deliberately not converted to a blind overwrite.
    saveTail.current = task;
    return task;
  }, [request]);
  useEffect(() => {
    if (!workspaceReady) return;
    setWorkspaceSaved('Gemmer arbejdsvalg …');
    const timer = setTimeout(() => void saveWorkspace({ articleId: snapshot?.article.id ?? null,
      articleVersion: snapshot?.article.version ?? null, motif, style, selected, editId, editText, pending })
      .catch(() => { if (alive.current) setWorkspaceSaved('Kunne ikke gemme arbejdsvalg. Genindlæs før nye bestillinger.'); }), 700);
    return () => clearTimeout(timer);
  }, [workspaceReady, snapshot, motif, style, selected, editId, editText, pending, saveWorkspace]);
  const running = jobs.some(j => j.status === 'running');
  useEffect(() => {
    if (!running) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refreshJobs(); } catch { /* Keep existing state; never restart a generation. */ }
      if (!stopped) timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 4000);
    return () => { stopped = true; clearTimeout(timer); void refreshBudget(); };
  }, [running, refreshJobs, refreshBudget]);
  const articleJobs = jobs.filter(j => j.articleId === snapshot?.article.id);
  const ideasJob = articleJobs.find(j => j.operation === 'ideas' && j.status === 'succeeded' &&
    (j.articleVersion === snapshot?.article.version || (Boolean(snapshot?.article.textVersion) && (j.result as Ideas)?.textVersion === snapshot?.article.textVersion)));
  const ideas = ideasJob?.result as Ideas | undefined;
  const assets = articleJobs.filter(j => ['generate', 'edit', 'press-import', 'recover'].includes(j.operation) && j.status === 'succeeded');
  const run = async (operation: string, parameters: unknown, refresh = false) => {
    if (!snapshot) return;
    if (!workspaceReady || pending) throw new Error('Kontrollér den eksisterende bestilling, før du starter en ny.');
    const body = { articleId: snapshot.article.id, articleVersion: snapshot.article.version, operation,
      parameters, refresh, requestId: crypto.randomUUID(), quoteId: quotes[operation]?.id };
    setPending(body);
    // Persist the exact request key before transport, so a reload cannot buy it twice.
    await saveWorkspace({ articleId: snapshot.article.id, articleVersion: snapshot.article.version, motif, style,
      selected, editId, editText, pending: body });
    const result = await request('run', body);
    setPending(null); setJobs(previous => [result.job, ...previous.filter(j => j.id !== result.job.id)]);
  };
  const updateSelection = (id: string, patch: Partial<ImageGenSelection>) => {
    setPreviewId(null); setSelected(previous => previous.map(s => s.jobId === id ? { ...s, ...patch } : s));
  };
  return <main className={embedded ? styles.embeddedShell : styles.shell}>
    <header className={embedded ? styles.embeddedHeader : styles.header}><div><h1>Image-gen</h1><p>Apropos’ fælles billedværksted</p></div>{onClose ? <button className={styles.close} type="button" onClick={onClose} aria-label="Luk Image-gen">×</button> : <Link href="/ai" aria-label="Tilbage til forsiden">Luk ×</Link>}</header>
    <div className={styles.content}>
      <details className={styles.utility}><summary>Budget og indstillinger</summary>
        <p className={styles.budget}>{budget}<small>Separat fra Liv · estimat, ikke providerfaktura</small></p>
        <small role="status">{workspaceSaved}</small>
        {owner && <StyleSettings user={user} onSaved={() => void refreshBudget()}/>} 
      </details>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {pending && <details className={styles.utility} open><summary>En tidligere bestilling kræver kontrol</summary><button disabled={busy} onClick={() => void act(async () => {
        const result = await request('run', pending); setPending(null); setJobs(p => [result.job, ...p.filter(j => j.id !== result.job.id)]);
      })}>Kontrollér samme bestilling</button></details>}
      {!snapshot ? <>
        <h2>Vælg en artikel</h2><p>Vælg en Webflow-artikel. Derefter hjælper Image-gen dig med ét billede ad gangen.</p>
        <form className={styles.search} onSubmit={e => { e.preventDefault(); void act(() => search()); }}><input aria-label="Søg i Webflow-artikler" value={query} maxLength={150} onChange={e => setQuery(e.target.value)} placeholder="Søg efter titel …"/><button disabled={busy}>Søg</button></form>
        <div className={styles.list}>{rows.map(row => <button className={styles.article} disabled={busy} key={row.id} onClick={() => void act(() => open(row.id))}>
          {row.cover ? <Image unoptimized width={480} height={280} src={row.cover} alt=""/> : <div className={styles.noImage}>Intet cover</div>}
          <span className={styles.badge}>{row.isDraft ? 'Kladde' : 'Udgivet / staged'}</span><strong>{row.title}</strong><span>Åbn artikel →</span>
        </button>)}</div>
        {cursor !== null && <button disabled={busy} onClick={() => void act(() => search(cursor))}>Søg / indlæs flere artikler</button>}
        {!rows.length && !busy && <p>Ingen artikler på denne side. Prøv en anden titel eller søg videre.</p>}
        {jobs.length > 0 && <details className={styles.utility}><summary>Tidligere billedarbejde</summary>{jobs.map(job => <button className={styles.history} key={job.id} onClick={() => void act(() => open(job.articleId))}>
          {job.operation} · {statusName[job.status]}<small>{new Date(job.createdAt).toLocaleString('da-DK')}</small>
        </button>)}</details>}
      </> : <>
        <button className={styles.back} onClick={() => { setSnapshot(null); setPreviewId(null); }}>← Alle artikler</button>
        <h2>{snapshot.article.title}</h2>
        <details><summary>Læs artikelgrundlaget</summary>{snapshot.article.sections.map(s => <p key={s.id}>{s.text}</p>)}</details>
        {(snapshot.cover?.url || snapshot.existingImages?.length) ? <details><summary>Eksisterende billeder · bevares</summary>
          {snapshot.cover?.url && <figure><Image unoptimized src={snapshot.cover.url} width={960} height={640} alt="Nuværende cover"/><figcaption>Nuværende cover</figcaption></figure>}
          {snapshot.existingImages?.map((im, i) => <figure key={i}><Image unoptimized src={im.url} width={960} height={640} alt={im.alt}/><figcaption>{im.caption}</figcaption></figure>)}
        </details> : null}
        <div className={styles.actions}>
          <button disabled={busy || running || !quotes.ideas} onClick={() => void act(() => run('ideas', {}, Boolean(ideas)))}>{ideas ? 'Opdatér idéer og pressesøgning' : 'Find billedidéer'} {quotes.ideas && `· op til ${money(quotes.ideas.estimateUpToDkk)} kr.`}</button>
          <button disabled={busy} onClick={() => void act(() => open(snapshot.article.id))}>Opdatér artikel fra Webflow</button>
        </div>
        {articleJobs.filter(j => j.status !== 'succeeded').length > 0 && <details className={styles.utility}><summary>Status og gendannelse</summary>{articleJobs.filter(j => j.status !== 'succeeded').map(job => <div key={job.id}><p role="status">{statusName[job.status]}</p>
          {(job.status === 'uncertain' || Date.now() > job.deadline + 120000) && <button disabled={busy} onClick={() => void act(async () => {
            const result = await request('recover', { id: job.id }); setJobs(p => [result.job, ...p.filter(j => j.id !== result.job.id)]);
          })}>{['generate', 'edit'].includes(job.operation) ? 'Gendan eventuelt gemt billede · ingen AI-kald' : 'Kontrollér gemt status · ingen AI-kald'}</button>}</div>)}
        </details>}
        {ideas && <section><h3>Tre motivforslag</h3><div className={styles.list}>{ideas.motifs.map((m, i) => <button className={styles.card} key={i} onClick={() => { setMotif(m); setEditId(null); }}>
          <strong>{m.title}</strong><p>{m.description}</p><blockquote>“{m.excerpt}”</blockquote><span>Vælg motiv →</span>
        </button>)}</div></section>}
        {motif && <section className={styles.card}><h3>{editId ? 'Ret billedet' : 'Dit motiv'}</h3>
          <label>Motivbeskrivelse<textarea value={motif.description} maxLength={2500} onChange={e => setMotif({ ...motif, description: e.target.value })}/></label>
          <label>Stil<select value={style} onChange={e => setStyle(e.target.value)}><option value="expressive">Expressive · Apropos farver</option><option value="minimal">Minimal · enkel tegning</option></select></label>
          {editId && <label>Hvad skal ændres?<textarea value={editText} maxLength={1000} onChange={e => setEditText(e.target.value)}/></label>}
          <p>Ét billede. Ingen automatisk regenerering. Illustration, ikke dokumentation af koncerten.</p>
          <div className={styles.actions}><button disabled={busy || running || !quotes[editId ? 'edit' : 'generate'] || (Boolean(editId) && editText.trim().length < 3)} onClick={() => void act(() => run(editId ? 'edit' : 'generate', {
            style, description: motif.description, sectionId: motif.sectionId, ...(editId ? { parentJobId: editId, editInstruction: editText } : {}),
          }))}>{editId ? 'Lav rettelsen' : 'Generér ét billede'} · op til {money(quotes[editId ? 'edit' : 'generate']?.estimateUpToDkk ?? 0)} kr.</button>
          <button onClick={() => { setMotif(null); setEditId(null); }}>Andet motiv</button></div>
        </section>}
        {ideas?.press && <details className={styles.utility}><summary>Pressefund</summary><section><p>Relevans og tilladelse skal kontrolleres. Et søgeresultat er ikke en brugstilladelse.</p>
          {ideas.press.candidates.map(candidate => <PressCard key={candidate.id} candidate={candidate} disabled={busy || running} onImport={credit => void act(() => run('press-import', {
            ideasJobId: ideasJob!.id, candidateId: candidate.id, credit, permissionConfirmed: true,
          }))}/>)}
          {!ideas.press.candidates.length && <p>{ideas.press.status === 'searched' ? 'Ingen brugbare pressefund i den afgrænsede søgning.' : 'Pressesøgningen kunne ikke afsluttes. Dine motivforslag er bevaret.'}</p>}
        </section></details>}
        {assets.length > 0 && <section><h3>Dine gemte billedversioner</h3><div className={styles.list}>{assets.map(job => {
          const asset = job.result as ImageGenAsset, selection = selected.find(s => s.jobId === job.id);
          return <div className={styles.card} key={job.id}><PrivateImage user={user} id={job.id} alt="Gemt billedversion"/><p>{asset.credit}</p>
            {asset.provider === 'openai' && <div className={styles.actions}><button onClick={() => {
              const p = job.parameters as { description: string; sectionId: string };
              setMotif({ title: 'Ny variant', description: p.description, sectionId: p.sectionId, excerpt: '' }); setStyle(asset.style!); setEditId(null);
            }}>Ny variant</button><button onClick={() => {
              const p = job.parameters as { description: string; sectionId: string };
              setMotif({ title: 'Ret billedet', description: p.description, sectionId: p.sectionId, excerpt: '' }); setStyle(asset.style!); setEditId(job.id); setEditText('');
            }}>Ret billedet</button></div>}
            <label className={styles.check}><input type="checkbox" checked={Boolean(selection)} onChange={e => {
              setPreviewId(null); setSelected(previous => e.target.checked ? [...previous, { jobId: job.id, target: 'body',
                sectionId: snapshot.article.sections[0]?.id, alt: '', caption: asset.provider === 'openai' ? 'Illustration inspireret af artiklen.' : '', credit: asset.credit }] : previous.filter(s => s.jobId !== job.id));
            }}/>Vælg til artikel</label>
            {selection && <><label>Placering<select value={selection.target} onChange={e => updateSelection(job.id, { target: e.target.value as 'cover' | 'body' })}><option value="body">I brødteksten</option><option value="cover">Cover</option></select></label>
              {selection.target === 'body' ? <label>Efter afsnit<select value={selection.sectionId} onChange={e => updateSelection(job.id, { sectionId: e.target.value })}>{snapshot.article.sections.map((s, i) => <option value={s.id} key={s.id}>{i + 1}. {s.text.slice(0, 75)}</option>)}</select></label> : snapshot.cover && <label className={styles.check}><input type="checkbox" checked={Boolean(selection.replaceCover)} onChange={e => updateSelection(job.id, { replaceCover: e.target.checked })}/>Jeg vil erstatte det eksisterende cover</label>}
              <label>Alt-tekst<input value={selection.alt} maxLength={500} onChange={e => updateSelection(job.id, { alt: e.target.value })}/></label>
              <label>Billedtekst<input value={selection.caption} maxLength={500} onChange={e => updateSelection(job.id, { caption: e.target.value })}/></label>
              <label>Kredit<input value={selection.credit} maxLength={500} onChange={e => updateSelection(job.id, { credit: e.target.value })}/></label><small>Bevar kildens kredit: {asset.credit}</small></>}
          </div>;
        })}</div></section>}
        {selected.length > 0 && <section className={styles.card}><h3>Aflevering til Webflow</h3><p>Kun dine valgte billeder gemmes. Artiklen publiceres ikke.</p>
          {!previewId ? <button disabled={busy || running} onClick={() => void act(async () => {
            const data = await request('draft', { action: 'preview', articleId: snapshot.article.id, articleVersion: snapshot.article.version, selections: selected });
            setPreviewId(data.previewId);
          })}>Se og kontrollér preview</button> : <>
            {selected.filter(s => s.target === 'cover').map(s => <figure key={s.jobId}><PrivateImage user={user} id={s.jobId} alt={s.alt}/><figcaption>Cover · {s.caption} {s.credit}</figcaption></figure>)}
            {snapshot.article.sections.map(s => <div key={s.id}><p>{s.text}</p>{selected.filter(p => p.target === 'body' && p.sectionId === s.id).map(p => <figure key={p.jobId}><PrivateImage user={user} id={p.jobId} alt={p.alt}/><figcaption>{p.caption} {p.credit}</figcaption></figure>)}</div>)}
            <button disabled={busy || running} onClick={() => void act(async () => {
              const result = await request('draft', { action: 'save', articleId: snapshot.article.id, articleVersion: snapshot.article.version,
                selections: selected, previewId, requestId: `save-${previewId}` });
              setJobs(previous => [result.job, ...previous.filter(j => j.id !== result.job.id)]); setPreviewId(null);
            })}>Gem i Webflow-kladden</button>
          </>}
        </section>}
        {articleJobs.filter(j => j.operation === 'save-draft' && j.status === 'succeeded').map(j => <p role="status" key={j.id}>Valgte billeder gemt og læst tilbage fra Webflow-kladden. Ikke publiceret.</p>)}
      </>}
      {historyCursor && <button disabled={busy} onClick={() => void act(async () => {
        const data = await request(`jobs?cursor=${historyCursor}`);
        setJobs(previous => [...previous, ...data.jobs.filter((j: ImageGenJob) => !previous.some(p => p.id === j.id))]);
        setHistoryCursor(data.nextCursor ?? null);
      })}>Hent ældre billedversioner</button>}
    </div>
  </main>;
}

function PrivateImage({ user, id, alt }: { user: User; id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true, objectUrl: string | undefined; const controller = new AbortController();
    void (async () => {
      const r = await fetch(`/api/image-gen/asset?id=${id}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, signal: controller.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('asset');
      const blob = await r.blob(); if (!alive) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    })().catch(() => undefined);
    return () => { alive = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [user, id]);
  return url ? <Image unoptimized src={url} width={1536} height={1024} alt={alt}/> : <p>Henter gemt billede …</p>;
}
function PressCard({ candidate: c, disabled, onImport }: { candidate: ImageGenPressCandidate; disabled: boolean; onImport: (credit: string) => void }) {
  const [permission, setPermission] = useState(false), [credit, setCredit] = useState(c.credit || '');
  return <div className={styles.card}><a href={c.sourceUrl} target="_blank" rel="noreferrer">Åbn kilden ↗</a><a href={c.originalUrl} target="_blank" rel="noreferrer">Se originalbilledet ↗</a>
    <p>Rettigheder: ukendte. {c.credit ? `Kildens kredit: ${c.credit}` : 'Kilden gav ingen sikker billedkredit.'}</p>
    {!c.credit && <label>Faktisk kredit fra din tilladelse<input value={credit} maxLength={500} onChange={e => setCredit(e.target.value)}/></label>}
    <label className={styles.check}><input type="checkbox" checked={permission} onChange={e => setPermission(e.target.checked)}/>Jeg har kontrolleret motivet og har tilladelse til at bruge billedet redaktionelt.</label>
    <button disabled={disabled || !permission || !credit.trim()} onClick={() => onImport(credit)}>Hent til mine billeder</button>
  </div>;
}
