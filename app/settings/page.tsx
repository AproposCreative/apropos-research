'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import CompactHeader from '../../components/CompactHeader';

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
  const [activeTab, setActiveTab] = useState<'webflow'|'social'|'profile'|'notifications'|'security'>('webflow');

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
              {fbStatus.reachable
                ? `Facebook OK: ${fbStatus.pageName || 'Ukendt side'} (${fbStatus.pageId})`
                : `Facebook ikke klar: ${fbStatus.error || 'ukendt fejl'}`}
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

        {activeTab === 'social' && (
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20 p-8">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Instagram & Facebook Token</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Konvertér et kort-livet token fra Graph API Explorer til et <strong>permanent Page Access Token</strong> der aldrig udløber.
          </p>

          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Trin 1: Hent kort-livet token</h3>
              <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside">
                <li>
                  Gå til{' '}
                  <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                    Graph API Explorer
                  </a>
                </li>
                <li>Vælg din app (fx &quot;Apropos Publisher v2&quot;)</li>
                <li>Under &quot;User or Page&quot;: vælg din <strong>Facebook Page</strong></li>
                <li>
                  Tilføj permissions: <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">instagram_basic</code>,{' '}
                  <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">instagram_content_publish</code>,{' '}
                  <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">pages_show_list</code>,{' '}
                  <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">pages_read_engagement</code>,{' '}
                  <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">pages_manage_posts</code>
                </li>
                <li>Klik <strong>Generate Access Token</strong> og godkend</li>
              </ol>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Trin 2: Indsæt kort-livet token</label>
              <textarea
                rows={3}
                value={shortLivedToken}
                onChange={(e) => setShortLivedToken(e.target.value)}
                placeholder="Indsæt token fra Graph API Explorer her..."
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
              disabled={exchangeLoading || !shortLivedToken.trim()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-60 transition-colors"
            >
              {exchangeLoading ? 'Konverterer...' : 'Konvertér til permanent token'}
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
                            alert(`Kopieret! Sæt dette som INSTAGRAM_ACCESS_TOKEN i Vercel.\n\nPage: ${p.name}\nID (til FACEBOOK_PAGE_ID): ${p.id}`);
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
                        Permanent Page Access Token
                        {exchangeResult.neverExpires ? ' (udløber aldrig)' : ` (udløber: ${exchangeResult.expiresAt})`}
                      </span>
                    </div>
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
                          alert('Token kopieret! Sæt det som INSTAGRAM_ACCESS_TOKEN i Vercel → Environment Variables → Production, og redeploy.');
                        }}
                        className="absolute top-2 right-2 px-2 py-1 text-xs bg-slate-700 text-white rounded hover:bg-slate-600"
                      >
                        Kopiér
                      </button>
                    </div>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">{exchangeResult.hint}</p>
                  </div>
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
                {fbStatus.reachable
                  ? `Facebook OK: ${fbStatus.pageName || 'Ukendt side'} (${fbStatus.pageId})`
                  : `Facebook ikke klar: ${fbStatus.error || 'ukendt fejl'}`}
              </div>
            )}
          </div>

          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">Kræver env-variabler</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Token-konvertering kræver <code className="text-xs bg-blue-200 dark:bg-blue-800 px-1 py-0.5 rounded">META_APP_ID</code> og{' '}
              <code className="text-xs bg-blue-200 dark:bg-blue-800 px-1 py-0.5 rounded">META_APP_SECRET</code> i Vercel/env.
              Find dem i{' '}
              <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="underline">
                Meta App Dashboard
              </a>{' '}
              → Settings → Basic.
            </p>
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


