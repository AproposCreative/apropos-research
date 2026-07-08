'use client';

import { useCallback, useEffect, useState } from 'react';

type VerifyPayload = {
  ok: boolean;
  summary: string;
  issue?: string;
  instagramUsername?: string;
  facebookOk?: boolean;
  facebookPageName?: string;
  facebookError?: string;
  debug?: {
    isValid: boolean;
    type: string;
    expiresDescription: string;
    missingScopes: string[];
  };
};

type StatusPayload = {
  configured: boolean;
  meta?: { hasToken?: boolean; tokenPreview?: string; source?: string };
  verify: VerifyPayload | null;
  summary: string;
};

type RenewPayload = {
  success: boolean;
  error?: string;
  step?: string;
  pages?: Array<{ id: string; name: string; pageAccessToken: string }>;
  steps?: {
    exchange?: { ok: boolean; pageName?: string; neverExpires?: boolean };
    save?: { ok: boolean; savedTo?: string[] };
    verify?: VerifyPayload;
  };
};

function StatusPill({ ok, loading }: { ok: boolean | null; loading?: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/55">
        <span className="size-1.5 rounded-full bg-white/40 animate-pulse" />
        Tjekker…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
      <span className={`size-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      {ok ? 'Klar' : 'Skal fornyes'}
    </span>
  );
}

function StepRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 size-4 shrink-0 rounded-full border flex items-center justify-center text-[10px] ${ok ? 'border-emerald-500/50 text-emerald-400' : 'border-rose-500/50 text-rose-400'}`}>
        {ok ? '✓' : '✕'}
      </span>
      <div className="min-w-0">
        <p className="text-slate-800 dark:text-slate-100">{label}</p>
        {detail ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{detail}</p> : null}
      </div>
    </div>
  );
}

export default function SocialTokenPanel() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [metaReady, setMetaReady] = useState<boolean | null>(null);
  const [explorerToken, setExplorerToken] = useState('');
  const [renewing, setRenewing] = useState(false);
  const [renewResult, setRenewResult] = useState<RenewPayload | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/instagram/status');
      if (res.ok) setStatus(await res.json());
      else setStatus(null);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void fetch('/api/instagram/meta-config')
      .then((r) => r.json())
      .then((d: { exchangeReady?: boolean }) => setMetaReady(d.exchangeReady === true))
      .catch(() => setMetaReady(false));
  }, [loadStatus]);

  const renewToken = async () => {
    if (!explorerToken.trim()) return;
    setRenewing(true);
    setRenewResult(null);
    try {
      const res = await fetch('/api/instagram/renew-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortLivedToken: explorerToken.trim() }),
      });
      const data: RenewPayload = await res.json();
      setRenewResult(data);
      if (data.success) {
        setExplorerToken('');
        await loadStatus();
      } else if (data.pages?.length === 1) {
        const page = data.pages[0];
        const res2 = await fetch('/api/instagram/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: page.pageAccessToken }),
        });
        if (res2.ok) {
          setRenewResult({
            success: true,
            steps: {
              exchange: { ok: true, pageName: page.name },
              save: { ok: true, savedTo: ['firestore', 'file'] },
            },
          });
          setExplorerToken('');
          await loadStatus();
        }
      }
    } catch {
      setRenewResult({ success: false, error: 'Netværksfejl. Prøv igen.' });
    } finally {
      setRenewing(false);
    }
  };

  const saveManualToken = async () => {
    if (!manualToken.trim()) return;
    setManualSaving(true);
    setRenewResult(null);
    try {
      const res = await fetch('/api/instagram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: manualToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke gemme');
      setManualToken('');
      setRenewResult({
        success: data.success === true,
        steps: {
          save: { ok: true, savedTo: data.savedTo },
          verify: data.verify,
        },
        error: data.success ? undefined : data.summary,
      });
      await loadStatus();
    } catch (e) {
      setRenewResult({ success: false, error: e instanceof Error ? e.message : 'Kunne ikke gemme' });
    } finally {
      setManualSaving(false);
    }
  };

  const verify = renewResult?.steps?.verify ?? status?.verify;
  const isOk = verify?.ok === true;

  return (
    <div className="font-poppins space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-slate-800 dark:text-slate-100">
            Instagram & Facebook
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Ét trin: indsæt token fra Explorer — vi konverterer, gemmer og tester.
          </p>
        </div>
        <StatusPill ok={statusLoading ? null : isOk} loading={statusLoading} />
      </div>

      {/* Aktuel status */}
      <div
        className={`rounded-xl border px-4 py-3 ${
          statusLoading
            ? 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
            : isOk
              ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/25'
              : 'border-amber-200 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/25'
        }`}
      >
        {statusLoading ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Henter status…</p>
        ) : (
          <>
            <p className={`text-sm font-medium ${isOk ? 'text-emerald-900 dark:text-emerald-100' : 'text-amber-900 dark:text-amber-100'}`}>
              {status?.summary ?? 'Ukendt status'}
            </p>
            {status?.meta?.hasToken && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Token: {status.meta.tokenPreview} ({status.meta.source})
              </p>
            )}
            {verify?.debug && !statusLoading && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                {verify.debug.type} · {verify.debug.expiresDescription}
                {verify.instagramUsername ? ` · @${verify.instagramUsername}` : ''}
                {verify.facebookPageName ? ` · FB: ${verify.facebookPageName}` : ''}
              </p>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={statusLoading}
          className="mt-2 text-xs text-slate-600 dark:text-slate-400 underline hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
        >
          Opdater status
        </button>
      </div>

      {metaReady === false && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          Sæt <code className="text-xs">META_APP_ID</code> og <code className="text-xs">META_APP_SECRET</code> i{' '}
          <code className="text-xs">.env.local</code> og genstart serveren.
        </div>
      )}

      {/* Forny flow */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 p-4 space-y-4">
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="text-sm text-blue-600 dark:text-blue-400 underline"
        >
          {showHelp ? 'Skjul hjælp' : 'Hvor finder jeg bruger-token i Graph API Explorer?'}
        </button>
        {showHelp && (
          <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside border-t border-slate-200/80 dark:border-slate-600/50 pt-3">
            <li>
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                Graph API Explorer
              </a>
              {' — '}vælg jeres app.
            </li>
            <li>Vælg <strong>User</strong> (din profil), ikke Page.</li>
            <li>Tilføj: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement, pages_manage_posts.</li>
            <li>Generate Access Token → kopiér ind i feltet nedenfor.</li>
          </ol>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Bruger-token fra Explorer
          </label>
          <textarea
            rows={3}
            value={explorerToken}
            onChange={(e) => setExplorerToken(e.target.value)}
            placeholder="Kort token fra Explorer (gemmes ikke permanent i feltet)"
            className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-mono text-sm resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => void renewToken()}
          disabled={renewing || !explorerToken.trim() || metaReady === false}
          className="w-full py-3 rounded-xl border border-white/10 bg-slate-800 dark:bg-slate-700 text-white text-[14px] font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 transition-all active:scale-[0.99]"
        >
          {renewing ? 'Konverterer, gemmer og tester…' : 'Forny token'}
        </button>

        {renewResult && (
          <div
            className={`rounded-xl border p-4 space-y-3 ${
              renewResult.success
                ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50/90 dark:bg-emerald-950/30'
                : 'border-rose-200 dark:border-rose-700 bg-rose-50/90 dark:bg-rose-950/30'
            }`}
          >
            {renewResult.error && !renewResult.steps && (
              <p className="text-sm text-rose-800 dark:text-rose-200">{renewResult.error}</p>
            )}
            {renewResult.steps && (
              <>
                <p className={`text-sm font-semibold ${renewResult.success ? 'text-emerald-900 dark:text-emerald-100' : 'text-rose-900 dark:text-rose-100'}`}>
                  {renewResult.success ? 'Token er aktivt — I kan poste igen.' : 'Noget fejlede'}
                </p>
                <StepRow
                  label="Konverteret til page-token"
                  ok={!!renewResult.steps.exchange?.ok}
                  detail={renewResult.steps.exchange?.pageName}
                />
                <StepRow
                  label="Gemt i appen"
                  ok={!!renewResult.steps.save?.ok}
                  detail={renewResult.steps.save?.savedTo?.join(', ')}
                />
                <StepRow
                  label="Instagram"
                  ok={renewResult.steps.verify?.ok === true}
                  detail={
                    renewResult.steps.verify?.ok && renewResult.steps.verify.instagramUsername
                      ? `@${renewResult.steps.verify.instagramUsername}`
                      : renewResult.steps.verify?.summary
                  }
                />
                <StepRow
                  label="Facebook"
                  ok={renewResult.steps.verify?.facebookOk !== false}
                  detail={
                    renewResult.steps.verify?.facebookPageName ||
                    renewResult.steps.verify?.facebookError
                  }
                />
              </>
            )}
            {renewResult.pages && renewResult.pages.length > 1 && (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Sæt FACEBOOK_PAGE_ID i miljøet til den rigtige side, og prøv igen.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Manuel fallback — collapsed */}
      <details className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 px-4 py-2">
        <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400 py-2">
          Har du allerede et langt page-token? Indsæt det her
        </summary>
        <div className="pb-3 space-y-3 border-t border-slate-200/80 dark:border-slate-600/50 pt-3 mt-1">
          <textarea
            rows={2}
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="EAA… (page-token)"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void saveManualToken()}
            disabled={manualSaving || !manualToken.trim()}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {manualSaving ? 'Gemmer…' : 'Gem og test'}
          </button>
        </div>
      </details>
    </div>
  );
}
