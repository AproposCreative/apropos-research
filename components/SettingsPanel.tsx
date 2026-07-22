'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { SPLINE_BACKGROUNDS } from '@/lib/spline-backgrounds';
import ImageOptimizationSection from '@/components/settings/ImageOptimizationSection';
import ArticleTranslationSection from '@/components/settings/ArticleTranslationSection';
import SeoEngineSection from '@/components/settings/SeoEngineSection';

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
  nextStep?: string | null;
  settingsHref?: string | null;
};

type IgTokenDiag = {
  ok?: boolean;
  issue?: string;
  error?: string;
  hints?: string[];
  recommendation?: string | null;
  debug?: { isValid?: boolean; type?: string; expiresDescription?: string; missingScopes?: string[] };
  instagramProfile?: { ok: boolean; username?: string; error?: string } | null;
};

type Tab = 'appearance' | 'integrations' | 'account';

export default function SettingsPanel({
  isOpen,
  onClose,
  splineSelectedId,
  onSplineBgChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  splineSelectedId: string;
  onSplineBgChange: (id: string) => void;
}) {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('integrations');

  if (!isOpen) return null;

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#171717] md:rounded-xl border-l md:border border-white/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <h2 className="text-white font-medium text-sm">Indstillinger</h2>
        <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white rounded-lg transition-colors" aria-label="Luk">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="flex gap-1 px-3 pt-3 pb-1 flex-shrink-0 border-b border-white/[0.06]">
        {([
          { id: 'appearance' as Tab, label: 'Udseende' },
          { id: 'integrations' as Tab, label: 'Integrationer' },
          { id: 'account' as Tab, label: 'Konto' },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              tab === t.id
                ? 'bg-white/10 text-white border-white/40'
                : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div className="p-3 space-y-3">
          {tab === 'appearance' && (
            <AppearanceTab selectedId={splineSelectedId} onChange={onSplineBgChange} />
          )}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'account' && <AccountTab user={user} logout={logout} />}
        </div>
      </div>
    </div>
  );
}

function AppearanceTab({ selectedId, onChange }: { selectedId: string; onChange: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/80 p-3 space-y-1">
        <p className="text-white/90 text-sm font-medium">Baggrund (desktop)</p>
        <p className="text-white/45 text-xs leading-relaxed">
          3D-baggrund bag skrivepanelet — kun på større skærme. På mobil bruges en statisk gradient.
        </p>
      </div>
      <div className="space-y-1.5">
        {SPLINE_BACKGROUNDS.map((bg) => {
          const active = selectedId === bg.id;
          return (
            <button
              key={bg.id}
              type="button"
              onClick={() => onChange(bg.id)}
              className={`w-full text-left rounded-xl border px-3 py-3 transition-all ${
                active
                  ? 'border-white/30 bg-white/[0.08] text-white'
                  : 'border-white/10 bg-black/50 text-white/75 hover:border-white/18 hover:bg-white/[0.05]'
              }`}
            >
              <div className="font-medium text-sm">{bg.name}</div>
              <div className="text-xs text-white/45 mt-0.5 leading-snug">{bg.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type NewsletterIntegrationStatus = {
  connected: boolean;
  recipientCount: number;
  totalSignups: number;
  unsubscribedCount: number;
  source: string;
  formName: string | null;
  error: string | null;
};

function IntegrationsTab() {
  const { user } = useAuth();
  const [wfStatus, setWfStatus] = useState<WebflowStatus | null>(null);
  const [fbStatus, setFbStatus] = useState<FacebookStatus | null>(null);
  const [nlStatus, setNlStatus] = useState<NewsletterIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingWf, setTestingWf] = useState(false);
  const [testingFb, setTestingFb] = useState(false);
  const [testingNl, setTestingNl] = useState(false);
  const [igDiagLoading, setIgDiagLoading] = useState(false);
  const [igDiag, setIgDiag] = useState<IgTokenDiag | null>(null);

  const loadNewsletterIntegration = useCallback(async () => {
    if (!user) {
      setNlStatus(null);
      return;
    }
    setTestingNl(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/newsletter/integration-status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setNlStatus(await res.json());
      else setNlStatus(null);
    } catch {
      setNlStatus(null);
    }
    setTestingNl(false);
  }, [user]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/webflow/status');
      if (res.ok) setWfStatus(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (user) void loadNewsletterIntegration();
  }, [user, loadNewsletterIntegration]);

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
    setIgDiag(null);
    try {
      const res = await fetch('/api/facebook/publish-status');
      if (res.ok) setFbStatus(await res.json());
      else setFbStatus({ configured: false, reachable: false, pageName: null, pageId: null, error: 'Kunne ikke forbinde' });
    } catch {
      setFbStatus({ configured: false, reachable: false, pageName: null, pageId: null, error: 'Netværksfejl' });
    }
    setTestingFb(false);
  };

  const runIgDiagnose = async () => {
    setIgDiagLoading(true);
    setIgDiag(null);
    try {
      const res = await fetch('/api/instagram/token-status');
      setIgDiag(await res.json());
    } catch {
      setIgDiag({ ok: false, error: 'Kunne ikke køre diagnose.' });
    }
    setIgDiagLoading(false);
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
      </div>

      {/* Nyhedsbrev / Webflow-subscribers */}
      <div className="bg-black rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white/80 text-sm font-medium truncate">Nyhedsbrev (Webflow)</span>
            {!user ? (
              <span className="text-white/35 text-[10px]">Log ind</span>
            ) : testingNl && !nlStatus ? (
              <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin flex-shrink-0" />
            ) : nlStatus ? (
              <StatusDot ok={nlStatus.connected} />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void loadNewsletterIntegration()}
            disabled={testingNl || !user}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all border flex-shrink-0 ${
              testingNl || !user
                ? 'bg-white/10 text-white/40 border-white/20'
                : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            {testingNl ? 'Tester...' : 'Test'}
          </button>
        </div>
        {user && nlStatus && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/50">Modtagere</span>
              <span className={nlStatus.connected ? 'text-white/70' : 'text-amber-400/80'}>
                {nlStatus.connected ? nlStatus.recipientCount : '—'}
              </span>
            </div>
            {nlStatus.error ? <p className="text-red-400/75 text-[11px]">{nlStatus.error}</p> : null}
          </div>
        )}
      </div>

      {/* Facebook / Instagram */}
      <div className="bg-black rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white/80 text-sm font-medium">Facebook & Instagram</span>
            {fbStatus && <StatusDot ok={fbStatus.reachable} />}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => void runIgDiagnose()}
              disabled={igDiagLoading}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
                igDiagLoading ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              {igDiagLoading ? '…' : 'Diagnose'}
            </button>
            <button
              type="button"
              onClick={testFacebook}
              disabled={testingFb}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
                testingFb ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              {testingFb ? 'Tester...' : 'Test'}
            </button>
          </div>
        </div>
        {fbStatus && (
          <div className="space-y-2">
            {fbStatus.reachable ? (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-white/60 text-xs">{fbStatus.pageName || 'Side forbundet'}</span>
              </div>
            ) : (
              <p className="text-amber-400/85 text-xs">{fbStatus.error || 'Ikke forbundet'}</p>
            )}
          </div>
        )}
        {igDiag && (
          <div
            className={`rounded-lg border px-2.5 py-2 text-[11px] leading-snug space-y-1 ${
              igDiag.ok
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200/90'
                : 'border-white/15 bg-white/[0.04] text-white/55'
            }`}
          >
            {igDiag.error && !igDiag.debug && <p>{igDiag.error}</p>}
            {!igDiag.ok && igDiag.issue === 'session_invalidated' && (
              <p className="text-amber-200/90 font-medium">
                Session invalideret (fx adgangskodeskift). Lav nyt token under Indstillinger → Social.
              </p>
            )}
            {igDiag.debug && (
              <>
                <p>
                  Token: {igDiag.debug.isValid ? 'gyldig' : 'ugyldig'} · type {igDiag.debug.type ?? '?'} ·{' '}
                  {igDiag.debug.expiresDescription ?? '—'}
                </p>
                {igDiag.debug.missingScopes && igDiag.debug.missingScopes.length > 0 ? (
                  <p className="text-amber-200/80">Mangler: {igDiag.debug.missingScopes.join(', ')}</p>
                ) : null}
              </>
            )}
            {igDiag.instagramProfile && !igDiag.instagramProfile.ok && (
              <p className="text-amber-200/75">Instagram: {igDiag.instagramProfile.error}</p>
            )}
            {igDiag.recommendation ? (
              <p className="text-white/55">{igDiag.recommendation}</p>
            ) : null}
          </div>
        )}
      </div>

      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium px-0.5">
        Optimering
      </p>
      <SeoEngineSection variant="panel" />
      <ImageOptimizationSection variant="panel" showHeading={false} />
      <ArticleTranslationSection variant="panel" />
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
