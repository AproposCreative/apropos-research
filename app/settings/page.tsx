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
  const [activeTab, setActiveTab] = useState<'webflow'|'profile'|'notifications'|'security'>('webflow');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <span className="text-sm text-slate-500 dark:text-white/70">Collections findes automatisk ud fra token + site ID</span>
          </div>

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


