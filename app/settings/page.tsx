'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import CompactHeader from '../../components/CompactHeader';
import ImageOptimizationSection from '../../components/settings/ImageOptimizationSection';

type WebflowStatus = {
  connected: boolean;
  hasToken: boolean;
  hasSiteId: boolean;
  hasAuthorsCollectionId: boolean;
  hasArticlesCollectionId: boolean;
  tokenPreview?: string;
  siteId?: string;
  authorsCollectionId?: string;
  articlesCollectionId?: string;
  apiReachable?: boolean;
  collectionsReachable?: boolean;
  error?: string;
};

type FacebookPublishStatus = {
  configured: boolean;
  reachable: boolean;
  pageId: string | null;
  pageName: string | null;
  error: string | null;
  nextStep?: string | null;
  settingsHref?: string | null;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<WebflowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    apiToken: '',
    siteId: '',
    authorsCollectionId: '',
    articlesCollectionId: '',
  });
  const [saving, setSaving] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [fbTesting, setFbTesting] = useState(false);
  const [fbStatus, setFbStatus] = useState<FacebookPublishStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'webflow'|'optimise'|'social'|'profile'|'notifications'|'security'>('webflow');

  // Token exchange state
  const [shortLivedToken, setShortLivedToken] = useState('');
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeResult, setExchangeResult] = useState<{
    success?: boolean;
    pageAccessToken?: string;
    pageName?: string;
    neverExpires?: boolean;
    expiresAt?: string | null;
    error?: string;
    hint?: string;
    pages?: Array<{ id: string; name: string; pageAccessToken: string }>;
    message?: string;
  } | null>(null);
  const [metaExchangeReady, setMetaExchangeReady] = useState<boolean | null>(null);

  const [igTokenDiagLoading, setIgTokenDiagLoading] = useState(false);
  const [igTokenDiag, setIgTokenDiag] = useState<{
    ok?: boolean;
    error?: string;
    debug?: {
      isValid?: boolean;
      type?: string;
      expiresDescription?: string;
      scopes?: string[];
      missingScopes?: string[];
      dataAccessExpiresAt?: string | null;
    };
    instagramProfile?: { ok: boolean; username?: string; error?: string } | null;
    hints?: string[];
    recommendation?: string | null;
  } | null>(null);
  const [wfFields, setWfFields] = useState<any[]>([]);
  const [mapping, setMapping] = useState<{ entries: Array<{ internal: string; webflowSlug: string; transform?: string; required?: boolean }>}>({ entries: [] });
  const [savingMapping, setSavingMapping] = useState(false);
  // Profile state (migrated fra profile-siden)
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: user?.displayName || 'Bruger',
    email: user?.email || '',
    bio: 'Content creator and journalist',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tab = new URLSearchParams(window.location.search).get('tab');
    const valid = ['webflow', 'optimise', 'social', 'profile', 'notifications', 'security'] as const;
    if (tab && (valid as readonly string[]).includes(tab)) {
      setActiveTab(tab as (typeof valid)[number]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/webflow/status');
        const data = await res.json();
        if (mounted) {
          setStatus(data);
          setLastCheckedAt(new Date().toLocaleTimeString('da-DK'));
        }
        // Load persisted config for edit fields
        const cfgRes = await fetch('/api/webflow/config');
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          if (mounted) setForm({
            apiToken: cfg.apiToken || '',
            siteId: cfg.siteId || '',
            authorsCollectionId: cfg.authorsCollectionId || '',
            articlesCollectionId: cfg.articlesCollectionId || '',
          });
        }
      } catch (e) {
        if (mounted) setStatus({ connected: false, hasToken: false, hasSiteId: false, hasAuthorsCollectionId: false, hasArticlesCollectionId: false, error: String(e) });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load Webflow article fields (detailed)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/webflow/article-fields');
        if (res.ok) {
          const data = await res.json();
          setWfFields(data.fields || []);
        }
        const mapRes = await fetch('/api/webflow/mapping');
        if (mapRes.ok) setMapping(await mapRes.json());
      } catch {}
    })();
  }, []);

  const saveMapping = async () => {
    setSavingMapping(true);
    try {
      await fetch('/api/webflow/mapping', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify(mapping) });
    } catch {}
    setSavingMapping(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/webflow/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Kunne ikke gemme');
      // Refresh status after save
      const s = await (await fetch('/api/webflow/status')).json();
      setStatus(s);
      setLastCheckedAt(new Date().toLocaleTimeString('da-DK'));
    } catch (e) {
      alert('Fejl ved gemning: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  // Hidden auto-discovery: when token + siteId is present but collections missing, trigger
  useEffect(() => {
    (async () => {
      if (form.apiToken && form.siteId && (!form.authorsCollectionId || !form.articlesCollectionId)) {
        try {
          await fetch('/api/webflow/collections', { method: 'POST' });
          const cfg = await (await fetch('/api/webflow/config')).json();
          setForm((p) => ({
            ...p,
            authorsCollectionId: cfg.authorsCollectionId || p.authorsCollectionId,
            articlesCollectionId: cfg.articlesCollectionId || p.articlesCollectionId,
          }));
          const s = await (await fetch('/api/webflow/status')).json();
          setStatus(s);
          setLastCheckedAt(new Date().toLocaleTimeString('da-DK'));
        } catch {}
      }
    })();
   
  }, [form.apiToken, form.siteId]);

  const testConnection = async () => {
    setTesting(true);
    try {
      // Always refresh status
      const res = await fetch('/api/webflow/status');
      const s = await res.json();
      setStatus(s);
      setLastCheckedAt(new Date().toLocaleTimeString('da-DK'));
      // If not connected but API reachable, try discovery once
      if (!s.connected && s.apiReachable) {
        try {
          await fetch('/api/webflow/collections', { method: 'POST' });
          const s2 = await (await fetch('/api/webflow/status')).json();
          setStatus(s2);
          setLastCheckedAt(new Date().toLocaleTimeString('da-DK'));
        } catch {}
      }
    } catch (e) {
      alert('Kunne ikke teste forbindelse');
    } finally {
      setTesting(false);
    }
  };

  const testFacebookPublish = async () => {
    setFbTesting(true);
    try {
      const res = await fetch('/api/facebook/publish-status');
      const data = await res.json();
      setFbStatus(data);
    } catch {
      setFbStatus({
        configured: false,
        reachable: false,
        pageId: null,
        pageName: null,
        error: 'Kunne ikke teste Facebook-forbindelse.',
      });
    } finally {
      setFbTesting(false);
    }
  };

  const diagnoseInstagramToken = async () => {
    setIgTokenDiagLoading(true);
    setIgTokenDiag(null);
    try {
      const res = await fetch('/api/instagram/token-status');
      const data = await res.json();
      setIgTokenDiag(data);
    } catch {
      setIgTokenDiag({ ok: false, error: 'Kunne ikke hente diagnose.' });
    } finally {
      setIgTokenDiagLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'social') return;
    let cancelled = false;
    setMetaExchangeReady(null);
    void fetch('/api/instagram/meta-config')
      .then((r) => r.json())
      .then((d: { exchangeReady?: boolean }) => {
        if (!cancelled) setMetaExchangeReady(d.exchangeReady === true);
      })
      .catch(() => {
        if (!cancelled) setMetaExchangeReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 pb-12">
      <CompactHeader 
        title="Indstillinger"
        subtitle="System- og integrationsindstillinger"
      />

      {/* Top organiser like old Profile */}
      <div className="max-w-4xl">
        <div className="mb-6">
          <div className="flex space-x-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl p-1 border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20">
            {[
              { id: 'webflow', label: 'Webflow', icon: '🌐' },
              { id: 'optimise', label: 'Optimise', icon: '⚡' },
              { id: 'social', label: 'Social', icon: '📸' },
              { id: 'profile', label: 'Profile', icon: '👤' },
              { id: 'notifications', label: 'Notifications', icon: '🔔' },
              { id: 'security', label: 'Security', icon: '🔒' },
            ].map((tab: any) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-pure-black text-slate-800 dark:text-slate-100 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'webflow' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Webflow forbindelse</h2>
            {loading ? (
              <span className="text-slate-500 dark:text-white/60">Henter status…</span>
            ) : status?.connected ? (
              <span className="px-2 py-1 text-sm rounded bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-600/30">
                Forbundet{lastCheckedAt ? ` · ${lastCheckedAt}` : ''}
              </span>
            ) : (
              <span className="px-2 py-1 text-sm rounded bg-rose-600/15 text-rose-700 dark:text-rose-300 border border-rose-600/30">Ikke forbundet</span>
            )}
          </div>

          {!loading && status && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Input
                  label="Token"
                  placeholder="WEBFLOW_API_TOKEN"
                  value={form.apiToken}
                  onChange={(v) => setForm((p) => ({ ...p, apiToken: v }))}
                />
                <Input
                  label="Site ID"
                  placeholder="WEBFLOW_SITE_ID"
                  value={form.siteId}
                  onChange={(v) => setForm((p) => ({ ...p, siteId: v }))}
                />
              </div>
              <div className="space-y-2">
                <Field label="API reachable" ok={!!status.apiReachable} value={status.apiReachable ? 'Ja' : 'Nej'} />
                <Field label="Collections reachable" ok={!!status.collectionsReachable} value={status.collectionsReachable ? 'Ja' : 'Nej'} />
                {!status.connected && status.error && (
                  <div className="text-sm text-rose-300/90 bg-rose-900/20 border border-rose-800/40 rounded p-2">{status.error}</div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-60"
            >
              {saving ? 'Gemmer…' : 'Gem' }
            </button>
            <button
              onClick={testConnection}
              disabled={testing}
              className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white rounded-lg disabled:opacity-60"
            >
              {testing ? 'Tester…' : 'Test forbindelse'}
            </button>
            <button
              onClick={testFacebookPublish}
              disabled={fbTesting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-60"
            >
              {fbTesting ? 'Tester Facebook…' : 'Test Facebook'}
            </button>
            <span className="text-sm text-slate-500 dark:text-white/70">Collections findes automatisk ud fra token + site ID</span>
          </div>
          {fbStatus && (
            <div className={`mt-3 text-sm rounded-lg border px-3 py-2 ${
              fbStatus.reachable
                ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30'
                : 'bg-amber-600/15 text-amber-700 dark:text-amber-300 border-amber-600/30'
            }`}>
              {fbStatus.reachable ? (
                <p>
                  Facebook OK: {fbStatus.pageName || 'Ukendt side'} ({fbStatus.pageId})
                </p>
              ) : (
                <div className="space-y-2">
                  <p>Facebook ikke klar: {fbStatus.error || 'ukendt fejl'}</p>
                  {fbStatus.nextStep ? <p className="text-xs leading-snug opacity-95">{fbStatus.nextStep}</p> : null}
                  {fbStatus.settingsHref ? (
                    <Link
                      href={fbStatus.settingsHref}
                      className="inline-block text-xs font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2"
                    >
                      Åbn fanen Social (Instagram / token)
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Webflow Field Mapping */}
          <div className="mt-8">
            <h3 className="text-base font-semibold mb-3">Article fields (fra Webflow)</h3>
            <div className="overflow-hidden border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="px-3 py-2">Slug</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Required</th>
                    <th className="px-3 py-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {wfFields.map((f:any)=> (
                    <tr key={f.id || f.slug} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-100">{f.slug}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{f.type || '—'}</td>
                      <td className="px-3 py-2">{f.required ? <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">Yes</span> : <span className="text-slate-500">No</span>}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{f.reference?.collectionId ? (f.reference.isMulti ? 'Multi ref' : 'Ref') : '—'}</td>
                    </tr>
                  ))}
                  {wfFields.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={4}>Ingen felter hentet endnu.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Editable Mapping */}
          <div className="mt-8">
            <h3 className="text-base font-semibold mb-3">Field Mapping (our keys → Webflow slugs)</h3>
            <div className="overflow-hidden border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="px-3 py-2">Internal key</th>
                    <th className="px-3 py-2">Webflow slug</th>
                    <th className="px-3 py-2">Transform</th>
                    <th className="px-3 py-2">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.entries.map((e, idx) => (
                    <tr key={idx} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2">
                        <input value={e.internal} onChange={(ev)=>{
                          const v = ev.target.value; const copy = [...mapping.entries]; copy[idx] = { ...copy[idx], internal: v }; setMapping({ entries: copy });
                        }} className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={e.webflowSlug} onChange={(ev)=>{
                          const v = ev.target.value; const copy = [...mapping.entries]; copy[idx] = { ...copy[idx], webflowSlug: v }; setMapping({ entries: copy });
                        }} className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded">
                          {[...new Set(wfFields.map((f:any)=>f.slug))].map((slug:string)=> (
                            <option key={slug} value={slug}>{slug}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select value={e.transform||'identity'} onChange={(ev)=>{
                          const v = ev.target.value; const copy = [...mapping.entries]; copy[idx] = { ...copy[idx], transform: v }; setMapping({ entries: copy });
                        }} className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded">
                          {['identity','plainToHtml','markdownToHtml','stringArray','dateIso','referenceId','boolean','number'].map(t=> (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={!!e.required} onChange={(ev)=>{
                          const copy = [...mapping.entries]; copy[idx] = { ...copy[idx], required: ev.target.checked }; setMapping({ entries: copy });
                        }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-3">
              <button onClick={saveMapping} disabled={savingMapping} className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-60">{savingMapping?'Gemmer…':'Gem mapping'}</button>
              <button onClick={()=>setMapping(m=>({ entries:[...m.entries,{ internal:'', webflowSlug: wfFields[0]?.slug||'', transform:'identity'}]}))} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 dark:text-white rounded">+ Tilføj række</button>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'optimise' && (
          <div className="bg-[#171717] rounded-2xl border border-white/15 p-4 font-poppins">
            <ImageOptimizationSection variant="page" />
          </div>
        )}

        {activeTab === 'social' && (
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20 p-8">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Instagram & Facebook</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
            Når Instagram eller Facebook fejler, kan du her lave et nyt langvarigt <strong>page</strong>-token. Det sker i to trin: først et kort <strong>bruger</strong>-token fra Graph API Explorer (kun til feltet her på siden), derefter «Konvertér» — det lange token i den grønne boks er det, der skal i miljøet som Instagram-nøgle.
          </p>

          {metaExchangeReady === false && (
            <div className="mb-5 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 p-4">
              <p className="text-sm text-rose-900 dark:text-rose-100">
                Sæt <code className="text-xs bg-rose-100 dark:bg-rose-900/70 px-1 rounded">META_APP_ID</code> og{' '}
                <code className="text-xs bg-rose-100 dark:bg-rose-900/70 px-1 rounded">META_APP_SECRET</code> i{' '}
                <code className="text-xs">.env.local</code> (fra{' '}
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Meta → jeres app → App settings → Basic
                </a>
                ), gem og genstart dev-serveren.
              </p>
              <details className="mt-3 text-sm text-rose-800/95 dark:text-rose-200/85">
                <summary className="cursor-pointer font-medium text-rose-900 dark:text-rose-100">Trin-for-trin</summary>
                <ol className="mt-2 list-decimal list-inside space-y-1.5 pl-0.5">
                  <li>Samme app som i Graph API Explorer.</li>
                  <li>App ID → <code className="text-xs">META_APP_ID</code></li>
                  <li>App secret (Show) → <code className="text-xs">META_APP_SECRET</code> — del aldrig secret offentligt.</li>
                  <li>
                    <code className="text-xs">npm run dev</code> igen efter gem.
                  </li>
                </ol>
              </details>
            </div>
          )}

          <div className="space-y-4">
            <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200 list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span>Trin 1: Kort bruger-token fra Graph API Explorer</span>
                <span className="text-slate-400 text-xs shrink-0 group-open:hidden">Vis</span>
                <span className="text-slate-400 text-xs shrink-0 hidden group-open:inline">Skjul</span>
              </summary>
              <ol className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside border-t border-slate-200/80 dark:border-slate-600/50 pt-3">
                <li>
                  <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                    Graph API Explorer
                  </a>
                  {' — '}vælg jeres app.
                </li>
                <li>
                  Vælg <strong>User</strong>-token (din profil) i Explorer — det er kun input til konvertering herunder. Det endelige token til <code className="text-xs">.env</code> / Vercel får du efter «Konvertér» (page-token i grøn boks).
                </li>
                <li>
                  Tilladelser: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement, pages_manage_posts — derefter Generate Access Token.
                </li>
              </ol>
            </details>

            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
              Feltet herunder gemmes ikke — bruges kun én gang til at kalde Meta og hente page-token.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                1. Kort bruger-token fra Explorer (ikke i miljøet)
              </label>
              <textarea
                rows={3}
                value={shortLivedToken}
                onChange={(e) => setShortLivedToken(e.target.value)}
                placeholder="Kun det korte bruger-token fra Explorer — ikke page-token og ikke det lange efter konvertering"
                className="w-full px-4 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 font-mono text-sm resize-none"
              />
            </div>

            <button
              onClick={async () => {
                if (!shortLivedToken.trim()) return;
                setExchangeLoading(true);
                setExchangeResult(null);
                try {
                  const res = await fetch('/api/instagram/exchange-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shortLivedToken: shortLivedToken.trim() }),
                  });
                  const data = await res.json();
                  setExchangeResult(data);
                } catch (err) {
                  setExchangeResult({ error: 'Netværksfejl: ' + String(err) });
                } finally {
                  setExchangeLoading(false);
                }
              }}
              disabled={exchangeLoading || !shortLivedToken.trim() || metaExchangeReady === false}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-60 transition-colors"
            >
              {exchangeLoading ? 'Konverterer...' : 'Konvertér til langvarigt token'}
            </button>

            {exchangeResult && (
              <div className={`rounded-xl border p-4 ${
                exchangeResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700'
                  : exchangeResult.error
                    ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
              }`}>
                {exchangeResult.error && (
                  <p className="text-sm text-rose-700 dark:text-rose-300">{exchangeResult.error}</p>
                )}
                {exchangeResult.message && (
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">{exchangeResult.message}</p>
                )}
                {exchangeResult.pages && (
                  <div className="space-y-2">
                    {exchangeResult.pages.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.name} <span className="text-slate-500">({p.id})</span></span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(p.pageAccessToken);
                            alert(`Kopieret. Opdater Instagram-nøglen i miljøet.\nSide: ${p.name}\nSide-ID (til Facebook): ${p.id}`);
                          }}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Kopiér token
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {exchangeResult.success && exchangeResult.pageAccessToken && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        Trin 2: Nyt page-token klar
                        {exchangeResult.neverExpires ? ' · uden udløb' : exchangeResult.expiresAt ? ` · udløber ${exchangeResult.expiresAt}` : ''}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100 border-l-4 border-emerald-500 pl-3 py-1">
                      Kopier <strong>den lange streng</strong> herunder til Instagram-nøglen i miljøet (<code className="text-xs">INSTAGRAM_ACCESS_TOKEN</code> / Vercel). Det er <strong>ikke</strong> det samme som bruger-tokenet fra Explorer.
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Side: <strong>{exchangeResult.pageName}</strong>
                    </p>
                    <div className="relative">
                      <pre className="text-xs bg-slate-100 dark:bg-slate-800 rounded-lg p-3 overflow-x-auto font-mono break-all whitespace-pre-wrap border border-slate-200 dark:border-slate-700">
                        {exchangeResult.pageAccessToken}
                      </pre>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(exchangeResult.pageAccessToken!);
                          alert('Kopieret. Indsæt som Instagram-token i miljøet og genstart eller redeploy.');
                        }}
                        className="absolute top-2 right-2 px-2 py-1 text-xs bg-slate-700 text-white rounded hover:bg-slate-600"
                      >
                        Kopiér
                      </button>
                    </div>
                    {exchangeResult.hint ? (
                      <p className="text-sm text-emerald-800/90 dark:text-emerald-200/90">{exchangeResult.hint}</p>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">Tjek aktivt Instagram-token</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Ser om miljøets token er gyldigt. <strong>Langvarigt page-token</strong> (diagnose: Type PAGE) får du ved at konvertere på fanen her og lægge den <strong>lange</strong> streng i miljøet — ikke det korte fra Explorer. Når Type stadig er USER men alt virker, viser diagnose en konkret anbefaling.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void diagnoseInstagramToken()}
                disabled={igTokenDiagLoading}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white rounded-lg disabled:opacity-60 transition-colors"
              >
                {igTokenDiagLoading ? 'Kører…' : 'Kør diagnose'}
              </button>
            </div>
            {igTokenDiag && (
              <div
                className={`mt-3 text-sm rounded-lg border px-3 py-3 space-y-2 ${
                  igTokenDiag.ok
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100'
                    : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700 text-rose-900 dark:text-rose-100'
                }`}
              >
                {igTokenDiag.error && !igTokenDiag.debug && <p>{igTokenDiag.error}</p>}
                {igTokenDiag.debug && (
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-200">
                    <li>Gyldig: {igTokenDiag.debug.isValid ? 'ja' : 'nej'}</li>
                    <li>Type: {igTokenDiag.debug.type ?? '—'}</li>
                    <li>Udløb: {igTokenDiag.debug.expiresDescription ?? '—'}</li>
                    {igTokenDiag.debug.dataAccessExpiresAt && (
                      <li>Data-adgang udløber: {igTokenDiag.debug.dataAccessExpiresAt}</li>
                    )}
                    {igTokenDiag.debug.scopes && igTokenDiag.debug.scopes.length > 0 && (
                      <li>Scopes: {igTokenDiag.debug.scopes.join(', ')}</li>
                    )}
                    {igTokenDiag.debug.missingScopes && igTokenDiag.debug.missingScopes.length > 0 && (
                      <li className="text-amber-800 dark:text-amber-200">Mangler: {igTokenDiag.debug.missingScopes.join(', ')}</li>
                    )}
                  </ul>
                )}
                {igTokenDiag.instagramProfile && (
                  <p className="text-slate-700 dark:text-slate-200">
                    Instagram API:{' '}
                    {igTokenDiag.instagramProfile.ok
                      ? `@${igTokenDiag.instagramProfile.username ?? '?'} (OK)`
                      : igTokenDiag.instagramProfile.error}
                  </p>
                )}
                {igTokenDiag.recommendation ? (
                  <p className="text-sm text-sky-800 dark:text-sky-200 border-l-4 border-sky-500 pl-3 py-1 rounded-r bg-sky-50/80 dark:bg-sky-950/40">
                    {igTokenDiag.recommendation}
                  </p>
                ) : null}
                {igTokenDiag.hints && igTokenDiag.hints.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 border-t border-current/20 pt-2 mt-2 opacity-95">
                    {igTokenDiag.hints.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-3">Facebook-forbindelse</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={testFacebookPublish}
                disabled={fbTesting}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-60 transition-colors"
              >
                {fbTesting ? 'Tester...' : 'Test Facebook-forbindelse'}
              </button>
            </div>
            {fbStatus && (
              <div className={`mt-3 text-sm rounded-lg border px-3 py-2 ${
                fbStatus.reachable
                  ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30'
                  : 'bg-amber-600/15 text-amber-700 dark:text-amber-300 border-amber-600/30'
              }`}>
                {fbStatus.reachable ? (
                  <p>
                    Facebook OK: {fbStatus.pageName || 'Ukendt side'} ({fbStatus.pageId})
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p>Facebook ikke klar: {fbStatus.error || 'ukendt fejl'}</p>
                    {fbStatus.nextStep ? <p className="text-xs leading-snug opacity-95">{fbStatus.nextStep}</p> : null}
                    {fbStatus.settingsHref ? (
                      <Link
                        href={fbStatus.settingsHref}
                        className="inline-block text-xs font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2"
                      >
                        Åbn fanen Social (Instagram / token)
                      </Link>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {activeTab === 'profile' && (
        <>
        {/* Profil & konto (samme visuelle stil som profil) */}
        <div className="mt-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Konto & profil</h2>
            <button
              onClick={() => setIsEditingProfile(!isEditingProfile)}
              className="px-4 py-2 bg-slate-600 dark:bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-400 transition-colors"
            >
              {isEditingProfile ? 'Annuller' : 'Redigér profil'}
            </button>
          </div>

          <div className="flex items-center gap-6 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold">
              {profileData.displayName?.charAt(0) || 'U'}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{profileData.displayName}</h3>
              <p className="text-slate-600 dark:text-slate-400">{profileData.email || '—'}</p>
              <p className="text-sm text-slate-500 dark:text-slate-500">{profileData.bio}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Navn</label>
              <input
                type="text"
                value={profileData.displayName}
                onChange={(e) => setProfileData({ ...profileData, displayName: e.target.value })}
                disabled={!isEditingProfile}
                className="w-full px-4 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-200 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
              <input
                type="email"
                value={profileData.email}
                onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                disabled={!isEditingProfile}
                className="w-full px-4 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-200 disabled:opacity-50"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Bio</label>
              <textarea
                rows={3}
                value={profileData.bio}
                onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                disabled={!isEditingProfile}
                className="w-full px-4 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-200 disabled:opacity-50 resize-none"
              />
            </div>
          </div>

          {isEditingProfile && (
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setIsEditingProfile(false)}
                className="px-6 py-3 bg-slate-600 dark:bg-slate-500 text-white rounded-xl font-medium hover:bg-slate-700 dark:hover:bg-slate-400 transition-colors"
              >
                Gem profil
              </button>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="px-6 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-white/70 dark:hover:bg-slate-700/70 transition-all duration-200 border border-white/30 dark:border-slate-600/30"
              >
                Annuller
              </button>
            </div>
          )}
        </div>
        </>
        )}

        {activeTab === 'notifications' && (
        <>
        {/* Notifications */}
        <div className="mt-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20 p-8">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-6">Notification Preferences</h2>
          {['Email Notifications','Push Notifications','Weekly Notifications'].map((title, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30 mb-3">
              <div>
                <h3 className="font-medium text-slate-800 dark:text-slate-100">{title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{i===0?'Receive notifications via email': i===1?'Receive push notifications':'Receive weekly digest'}</p>
              </div>
              <button className="px-4 py-2 bg-slate-600 dark:bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-400 transition-colors">
                {i===2? 'Disabled' : 'Enabled'}
              </button>
            </div>
          ))}
        </div>
        </>
        )}

        {activeTab === 'security' && (
        <>
        {/* Security */}
        <div className="mt-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20 p-8">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-6">Security Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30">
              <div>
                <h3 className="font-medium text-slate-800 dark:text-slate-100">Change Password</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Update your account password</p>
              </div>
              <button className="px-4 py-2 bg-slate-600 dark:bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-400 transition-colors">Change</button>
            </div>
            <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30">
              <div>
                <h3 className="font-medium text-slate-800 dark:text-slate-100">Two-Factor Authentication</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Add an extra layer of security</p>
              </div>
              <button className="px-4 py-2 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-white/70 dark:hover:bg-slate-700/70 transition-all duration-200 border border-white/30 dark:border-slate-600/30">Enable</button>
            </div>
            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 backdrop-blur-sm rounded-xl border border-red-200 dark:border-red-800/30">
              <div>
                <h3 className="font-medium text-red-800 dark:text-red-200">Delete Account</h3>
                <p className="text-sm text-red-600 dark:text-red-400">Permanently delete your account and all data</p>
              </div>
              <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function Field({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-900">
      <div className="text-sm text-slate-700 dark:text-slate-200">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        <span className="text-sm text-slate-600 dark:text-slate-300">{value}</span>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-slate-800 dark:text-slate-100">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
      />
    </div>
  );
}


