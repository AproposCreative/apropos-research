'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import { useAuth } from '@/lib/auth-context';
import { uploadAudioToFirebaseStorage } from '@/lib/podcast/resumable-client';
import { looksLikeArticleUrl } from '@/lib/podcast/slug-from-url';
import type { PodcastJobStep, PodcastManifestEpisode } from '@/lib/podcast/types';

const primaryBtn =
  'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

const fieldClass =
  'apropos-input-dark w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2.5 text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]';

type UiStepId = 'uploading' | 'metadata' | 'encode' | 'manifest' | 'notification' | 'done';

const UI_STEPS: Array<{ id: UiStepId; label: string }> = [
  { id: 'uploading', label: 'Uploader fil...' },
  { id: 'metadata', label: 'Henter artikel-metadata...' },
  { id: 'encode', label: 'Behandler lyd...' },
  { id: 'manifest', label: 'Opdaterer manifest...' },
  { id: 'notification', label: 'Sender notifikation...' },
  { id: 'done', label: 'Klar' },
];

const JOB_STEP_ORDER: PodcastJobStep[] = [
  'metadata',
  'encode',
  'manifest',
  'notification',
  'cleanup',
  'done',
];

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function stepIndex(step: UiStepId | PodcastJobStep): number {
  if (step === 'uploading') return 0;
  if (step === 'done') return UI_STEPS.length - 1;
  const jobIdx = JOB_STEP_ORDER.indexOf(step as PodcastJobStep);
  if (jobIdx >= 0) return jobIdx + 1;
  return 0;
}

function StepIcon({ state }: { state: 'pending' | 'active' | 'done' | 'error' }) {
  if (state === 'active') {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center">
        <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </span>
    );
  }
  if (state === 'done') {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center text-white/70">
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (state === 'error') {
    return <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />;
  }
  return <span className="size-1.5 shrink-0 rounded-full bg-white/25" />;
}

type PodcastClientProps = {
  embedded?: boolean;
  onClose?: () => void;
};

export default function PodcastClient({ embedded = false, onClose }: PodcastClientProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [articleUrl, setArticleUrl] = useState('');
  const [validated, setValidated] = useState<{ slug: string; title: string } | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [activeUiStep, setActiveUiStep] = useState<UiStepId | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<PodcastManifestEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!user) throw new Error('Ikke logget ind');
    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [user]);

  const loadEpisodes = useCallback(async () => {
    if (!user) return;
    setEpisodesLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/podcast/manifest?limit=5', { headers, cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.episodes) {
        setEpisodes(json.episodes as PodcastManifestEpisode[]);
      }
    } catch {
      /* ignore */
    } finally {
      setEpisodesLoading(false);
    }
  }, [user, authHeaders]);

  useEffect(() => {
    void loadEpisodes();
  }, [loadEpisodes]);

  useEffect(() => {
    const url = articleUrl.trim();
    if (!url || !looksLikeArticleUrl(url)) {
      setValidated(null);
      setValidateError(
        url && !looksLikeArticleUrl(url)
          ? 'URL skal være en artikel på aproposmagazine.com'
          : null
      );
      return;
    }

    const t = window.setTimeout(async () => {
      if (!user) return;
      setValidating(true);
      setValidateError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch('/api/podcast/validate', {
          method: 'POST',
          headers,
          body: JSON.stringify({ articleUrl: url }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setValidated(null);
          setValidateError(json.error || 'Artikel ikke fundet på aproposmagazine.dk');
          return;
        }
        setValidated({ slug: json.slug, title: json.title });
      } catch {
        setValidated(null);
        setValidateError('Kunne ikke validere artikel');
      } finally {
        setValidating(false);
      }
    }, 500);

    return () => window.clearTimeout(t);
  }, [articleUrl, user, authHeaders]);

  const acceptFile = (f: File | null) => {
    if (!f) return;
    const ext = fileExtension(f.name);
    if (ext !== '.m4a' && ext !== '.mp3') {
      setFile(null);
      setFileError('Kun .m4a og .mp3 er tilladt');
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const canPublish = !!file && !!validated && !busy && !validating;

  const publishHint = useMemo(() => {
    if (busy) return null;
    if (!file) return 'Vælg en .m4a- eller .mp3-fil først';
    if (validating) return 'Validerer artikel…';
    if (!looksLikeArticleUrl(articleUrl)) return 'Indsæt en gyldig artikel-URL fra aproposmagazine.com';
    if (validateError) return validateError;
    if (!validated) return 'Artikel skal valideres før publicering';
    return null;
  }, [busy, file, validating, articleUrl, validateError, validated]);

  const stepStates = useMemo(() => {
    if (!activeUiStep && !pipelineError) {
      return UI_STEPS.map(() => 'pending' as const);
    }
    const currentIdx = activeUiStep ? stepIndex(activeUiStep) : -1;
    const failedIdx = pipelineError && activeUiStep ? stepIndex(activeUiStep) : -1;

    return UI_STEPS.map((s, i) => {
      if (pipelineError && i === failedIdx) return 'error' as const;
      if (activeUiStep === 'done' || i < currentIdx) return 'done' as const;
      if (i === currentIdx) return pipelineError ? ('error' as const) : ('active' as const);
      return 'pending' as const;
    });
  }, [activeUiStep, pipelineError]);

  const pollJob = async (jobId: string): Promise<void> => {
    const headers = await authHeaders();
    const started = Date.now();
    const timeoutMs = 10 * 60 * 1000;

    while (Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/podcast/status/${jobId}`, { headers, cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Kunne ikke hente status');
      }

      const step = json.step as PodcastJobStep;
      const status = json.status as string;

      if (step === 'metadata') setActiveUiStep('metadata');
      else if (step === 'encode') setActiveUiStep('encode');
      else if (step === 'manifest') setActiveUiStep('manifest');
      else if (step === 'notification' || step === 'cleanup') setActiveUiStep('notification');

      if (status === 'done') {
        setActiveUiStep('done');
        return;
      }
      if (status === 'error') {
        setPipelineError(json.error || 'Behandling fejlede');
        if (step === 'metadata') setActiveUiStep('metadata');
        else if (step === 'encode') setActiveUiStep('encode');
        else if (step === 'manifest') setActiveUiStep('manifest');
        else if (step === 'notification') setActiveUiStep('notification');
        else setActiveUiStep('metadata');
        throw new Error(json.error || 'Behandling fejlede');
      }
    }

    throw new Error('Behandling tog for lang tid — prøv igen');
  };

  const handlePublish = async () => {
    if (!file || !validated || !user) return;

    setBusy(true);
    setPipelineError(null);
    setUploadPct(0);
    setActiveUiStep('uploading');

    try {
      const headers = await authHeaders();
      const ext = fileExtension(file.name);

      const urlRes = await fetch('/api/podcast/upload-url', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slug: validated.slug,
          contentType: file.type,
          sizeBytes: file.size,
          fileExtension: ext,
        }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) {
        throw new Error(urlJson.error || 'Kunne ikke starte upload');
      }

      const storagePath =
        (typeof urlJson.storagePath === 'string' && urlJson.storagePath) || '';
      if (!storagePath) throw new Error('Manglende upload-sti fra server');
      await uploadAudioToFirebaseStorage(storagePath, file, setUploadPct);

      const processRes = await fetch('/api/podcast/process', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slug: validated.slug,
          articleUrl: articleUrl.trim(),
        }),
      });
      const processJson = await processRes.json();
      if (!processRes.ok) {
        throw new Error(processJson.error || 'Kunne ikke starte behandling');
      }

      setActiveUiStep('metadata');
      await pollJob(processJson.jobId as string);

      setFile(null);
      setArticleUrl('');
      setValidated(null);
      void loadEpisodes();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Noget gik galt';
      if (!pipelineError) setPipelineError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    if (embedded) return null;
    return null;
  }

  return (
    <div
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col bg-transparent font-poppins text-white'
          : 'min-h-[100dvh] bg-[#0a0a0a] font-poppins text-white'
      }
    >
      <EmbeddedAppHeader embedded={embedded} title="Podcast Upload" onClose={onClose} />

      <main
        className={
          embedded
            ? 'nice-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-5'
            : 'mx-auto max-w-xl px-4 py-6'
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".m4a,.mp3,audio/mp4,audio/mpeg"
          className="sr-only"
          onChange={(e) => acceptFile(e.target.files?.[0] || null)}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            acceptFile(e.dataTransfer.files?.[0] || null);
          }}
          className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 transition-all duration-200 active:scale-[0.99] ${
            file
              ? 'border-emerald-400/60 bg-white/[0.04]'
              : 'border-white/15 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex size-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] text-white/50">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </div>
          {file ? (
            <>
              <p className="text-[14px] font-medium text-white/90">{file.name}</p>
              <p className="text-[11px] text-white/40">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
                {busy && activeUiStep === 'uploading' ? ` · ${uploadPct}%` : ''}
              </p>
            </>
          ) : (
            <p className="text-[14px] text-white/70">Træk din podcast-fil hertil</p>
          )}
          <p className="text-[10px] text-white/30">.m4a eller .mp3</p>
        </button>

        {fileError ? (
          <p className="mt-2 text-[12px] text-red-400/95">{fileError}</p>
        ) : null}

        <label className="mt-4 block text-[11px] uppercase tracking-wider text-white/40" htmlFor="podcast-article-url">
          Artikel-URL
        </label>
        <input
          id="podcast-article-url"
          type="url"
          value={articleUrl}
          onChange={(e) => setArticleUrl(e.target.value)}
          placeholder="https://www.aproposmagazine.com/articles/..."
          className={`${fieldClass} mt-1.5`}
        />
        {validating ? (
          <p className="mt-1.5 text-[11px] text-white/40">Validerer artikel…</p>
        ) : null}
        {validateError ? (
          <p className="mt-1.5 text-[12px] text-red-400/95">{validateError}</p>
        ) : null}
        {validated ? (
          <p className="mt-1.5 text-[11px] text-white/50">
            <span className="size-1.5 mr-1.5 inline-block rounded-full bg-emerald-400 align-middle" />
            {validated.title}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!canPublish}
          onClick={() => void handlePublish()}
          className={`${primaryBtn} mt-5`}
        >
          {busy ? 'Publicerer…' : 'Publicer'}
        </button>
        {publishHint && !busy ? (
          <p className="mt-2 text-[11px] text-white/40">{publishHint}</p>
        ) : null}

        {(activeUiStep || pipelineError) ? (
          <section className="mt-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
            <ul className="space-y-2.5">
              {UI_STEPS.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2.5 text-[13px]">
                  <StepIcon state={stepStates[i]!} />
                  <span
                    className={
                      stepStates[i] === 'active'
                        ? 'text-white'
                        : stepStates[i] === 'done'
                          ? 'text-white/70'
                          : stepStates[i] === 'error'
                            ? 'text-red-400/95'
                            : 'text-white/30'
                    }
                  >
                    {s.label}
                  </span>
                </li>
              ))}
            </ul>
            {pipelineError ? (
              <p className="mt-3 text-[12px] text-red-400/95">{pipelineError}</p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-6 border-t border-white/[0.06] pt-5">
          <h2 className="text-[12px] font-medium uppercase tracking-wider text-white/45">
            Seneste episoder
          </h2>
          <ul className="mt-3 space-y-3">
            {episodesLoading ? (
              <li key="episodes-loading" className="text-[12px] text-white/35">Henter…</li>
            ) : episodes.length === 0 ? (
              <li key="episodes-empty" className="text-[12px] text-white/35">Ingen episoder endnu</li>
            ) : (
              episodes.map((ep, index) => (
                <li
                  key={ep.articleSlug || ep.id || `${ep.articleUrl}-${index}`}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                >
                  <a
                    href={ep.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-medium text-white/85 hover:text-white"
                  >
                    {ep.title}
                  </a>
                  <p className="mt-0.5 text-[10px] text-white/35">
                    {ep.publishedAt
                      ? new Date(ep.publishedAt).toLocaleDateString('da-DK', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
