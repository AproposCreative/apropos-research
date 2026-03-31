'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

type WebflowStatus = {
  connected: boolean;
  hasToken: boolean;
  hasSiteId: boolean;
  apiReachable?: boolean;
  collectionsReachable?: boolean;
  error?: string;
};

type FacebookStatus = {
  configured: boolean;
  reachable: boolean;
  pageName: string | null;
  pageId: string | null;
  error: string | null;
};

type Tab = 'integrations' | 'account';

export default function SettingsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('integrations');

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-[#171717] md:rounded-xl border-l md:border border-white/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <h2 className="text-white font-medium text-sm">Indstillinger</h2>
        <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white rounded-lg transition-colors" aria-label="Luk">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="flex gap-1 px-3 pt-3 pb-1 flex-shrink-0">
        {([
          { id: 'integrations' as Tab, label: 'Integrationer' },
          { id: 'account' as Tab, label: 'Konto' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
              tab === t.id
                ? 'bg-white/10 text-white border-white/40'
                : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'account' && <AccountTab user={user} logout={logout} />}
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const [wfStatus, setWfStatus] = useState<WebflowStatus | null>(null);
  const [fbStatus, setFbStatus] = useState<FacebookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingWf, setTestingWf] = useState(false);
  const [testingFb, setTestingFb] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/webflow/status');
      if (res.ok) setWfStatus(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const testWebflow = async () => {
    setTestingWf(true);
    try {
      const res = await fetch('/api/webflow/status');
      if (res.ok) setWfStatus(await res.json());
    } catch {}
    setTestingWf(false);
  };

  const testFacebook = async () => {
    setTestingFb(true);
    try {
      const res = await fetch('/api/facebook/publish-status');
      if (res.ok) setFbStatus(await res.json());
      else setFbStatus({ configured: false, reachable: false, pageName: null, pageId: null, error: 'Kunne ikke forbinde' });
    } catch {
      setFbStatus({ configured: false, reachable: false, pageName: null, pageId: null, error: 'Netværksfejl' });
    }
    setTestingFb(false);
  };

  return (
    <div className="space-y-3">
      {/* Webflow */}
      <div className="bg-black rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-sm font-medium">Webflow</span>
            {loading ? (
              <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            ) : (
              <StatusDot ok={!!wfStatus?.connected} />
            )}
          </div>
          <button
            onClick={testWebflow}
            disabled={testingWf}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
              testingWf ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            {testingWf ? 'Tester...' : 'Test'}
          </button>
        </div>
        {wfStatus && (
          <div className="space-y-1.5">
            <StatusRow label="API" ok={!!wfStatus.apiReachable} />
            <StatusRow label="Collections" ok={!!wfStatus.collectionsReachable} />
            {wfStatus.error && <p className="text-red-400/70 text-xs">{wfStatus.error}</p>}
          </div>
        )}
        {!loading && !wfStatus?.connected && (
          <p className="text-white/30 text-xs">Konfigureres via miljøvariabler (WEBFLOW_API_TOKEN, WEBFLOW_SITE_ID)</p>
        )}
      </div>

      {/* Facebook / Instagram */}
      <div className="bg-black rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-sm font-medium">Facebook & Instagram</span>
            {fbStatus && <StatusDot ok={fbStatus.reachable} />}
          </div>
          <button
            onClick={testFacebook}
            disabled={testingFb}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
              testingFb ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            {testingFb ? 'Tester...' : 'Test'}
          </button>
        </div>
        {fbStatus && (
          <div className="space-y-1.5">
            {fbStatus.reachable ? (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-white/60 text-xs">{fbStatus.pageName || 'Side forbundet'}</span>
              </div>
            ) : (
              <p className="text-amber-400/70 text-xs">{fbStatus.error || 'Ikke forbundet'}</p>
            )}
          </div>
        )}
        {!fbStatus && (
          <p className="text-white/30 text-xs">Tryk &quot;Test&quot; for at tjekke forbindelsen</p>
        )}
      </div>

      {/* Token info */}
      <div className="bg-black rounded-xl p-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium mb-2">Tokens & API-nøgler</p>
        <p className="text-white/40 text-xs leading-relaxed">
          Tokens og API-nøgler konfigureres via Vercel Environment Variables eller .env.local. 
          Kontakt admin for at ændre integrationsindstillinger.
        </p>
      </div>
    </div>
  );
}

function AccountTab({ user, logout }: { user: any; logout: () => Promise<void> }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Bruger';
  const email = user?.email || '';
  const initial = displayName.charAt(0).toUpperCase();

  const avatarBg = (() => {
    const seed = (user?.uid || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    const hues = [210, 260, 190, 330, 20, 150];
    return `hsl(${hues[seed % hues.length]} 70% 30%)`;
  })();

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); } catch (e) { console.error(e); }
    setLoggingOut(false);
  };

  return (
    <div className="space-y-3">
      {/* Profile card */}
      <div className="bg-black rounded-xl p-3 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: avatarBg }}
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-full h-full object-cover rounded-xl" />
            ) : initial}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-white/40 text-xs truncate">{email}</p>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="bg-black rounded-xl p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium">Konto</p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-white/50 text-xs">Login-metode</span>
            <span className="text-white/70 text-xs">
              {user?.providerData?.[0]?.providerId === 'google.com' ? 'Google' : 'Email'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/50 text-xs">Bruger-ID</span>
            <span className="text-white/40 text-[10px] font-mono truncate ml-2 max-w-[160px]">{user?.uid || '—'}</span>
          </div>
        </div>
      </div>

      {/* Log out */}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full px-3 py-2 rounded-xl text-xs transition-all border bg-white/5 text-red-400/80 border-white/10 hover:border-red-500/30 hover:bg-red-500/5 disabled:opacity-50"
      >
        {loggingOut ? 'Logger ud...' : 'Log ud'}
      </button>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />;
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <StatusDot ok={ok} />
      <span className={`text-xs ${ok ? 'text-white/50' : 'text-white/30'}`}>{label}</span>
      <span className={`text-xs ml-auto ${ok ? 'text-emerald-400/60' : 'text-red-400/60'}`}>{ok ? 'OK' : 'Fejl'}</span>
    </div>
  );
}
