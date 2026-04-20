'use client';

/**
 * AI-posting (Liv Brandt) — embedded klient i web-apps menuen.
 *
 * Følger Apropos design-systemet (`.cursor/rules/apropos-design-system.mdc`):
 * samme header, button-stile, surface-tints, sektion-row mønster og
 * dot-indikator-badges som NewsletterClient.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

interface LivPostingClientProps {
  embedded?: boolean;
  onClose?: () => void;
}

interface PreviewTopic {
  title: string;
  score: number;
  category?: string;
  tags?: string[];
  source?: {
    title?: string;
    url?: string;
    excerpt?: string;
    sourceName?: string;
    publishedAt?: string;
  };
}

interface PreviewArticle {
  title: string;
  subtitle: string;
  intro: string;
  content: string;
  slug: string;
  excerpt: string;
  section: string;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
  primaryKeyword?: string;
  wordCount: number;
}

interface PreviewResponse {
  ok: boolean;
  dayKey: string;
  topic: PreviewTopic | null;
  previewImageUrl?: string | null;
  reason?: string;
  article?: PreviewArticle;
  error?: string;
}

interface GateResult { name: string; pass: boolean; detail?: string }

type LivStatus =
  | 'processing'
  | 'published'
  | 'skipped_no_topic'
  | 'skipped_factcheck'
  | 'skipped_moderation'
  | 'skipped_tov'
  | 'skipped_duplicate'
  | 'failed';

interface StatusEntry {
  id: string;
  dayKey: string;
  status: LivStatus;
  topic?: string | null;
  title?: string | null;
  slug?: string | null;
  webflowItemId?: string | null;
  reason?: string | null;
  gateResults?: GateResult[];
  finishedAt: string | null;
}

interface StatusResponse {
  ok?: boolean;
  limit?: number;
  counts?: Record<string, number>;
  entries?: StatusEntry[];
  error?: string;
}

const STATUS_META: Record<LivStatus, { label: string; tone: 'ok' | 'warn' | 'err' | 'idle' }> = {
  processing: { label: 'I gang', tone: 'idle' },
  published: { label: 'Publiceret', tone: 'ok' },
  skipped_no_topic: { label: 'Intet emne', tone: 'warn' },
  skipped_factcheck: { label: 'Stoppet · factcheck', tone: 'warn' },
  skipped_moderation: { label: 'Stoppet · moderation', tone: 'warn' },
  skipped_tov: { label: 'Stoppet · tone', tone: 'warn' },
  skipped_duplicate: { label: 'Duplikat', tone: 'warn' },
  failed: { label: 'Fejlede', tone: 'err' },
};

const TONE_DOT: Record<'ok' | 'warn' | 'err' | 'idle', string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  err: 'bg-rose-400',
  idle: 'bg-white/40',
};

function formatDateDk(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatRelativeDate(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('da-DK', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

const segBtn = (active: boolean) =>
  `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
    active ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75'
  }`;

const primaryBtn =
  'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

const secondaryBtn =
  'w-full py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

const closeBtn =
  'flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white transition-all duration-200 hover:bg-white/[0.12] active:scale-[0.97]';

const pillLink =
  'px-3 py-1.5 rounded-lg border border-white/12 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white/90 transition-all duration-200 active:scale-[0.98]';

export default function LivPostingClient({ embedded = false, onClose }: LivPostingClientProps) {
  const { user } = useAuth();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StatusEntry[]>([]);
  const [historyCounts, setHistoryCounts] = useState<Record<string, number>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'topic' | 'history'>('topic');

  const authHeader = useCallback(async () => {
    if (!user) throw new Error('Log ind for at bruge AI-posting');
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const loadPreview = useCallback(
    async (opts: { generate?: boolean } = {}) => {
      const { generate = false } = opts;
      try {
        setError(null);
        if (generate) setGenerateLoading(true);
        else setPreviewLoading(true);
        const headers = await authHeader();
        const res = await fetch(`/api/liv/preview${generate ? '?generate=1' : ''}`, {
          headers,
          cache: 'no-store',
        });
        const data: PreviewResponse = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setPreview((prev) => {
          if (!generate && prev?.article && prev.topic?.title === data.topic?.title) {
            return { ...data, article: prev.article };
          }
          return data;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kunne ikke hente preview');
      } finally {
        setPreviewLoading(false);
        setGenerateLoading(false);
      }
    },
    [authHeader]
  );

  const loadHistory = useCallback(async () => {
    try {
      setHistoryError(null);
      setHistoryLoading(true);
      const headers = await authHeader();
      const res = await fetch('/api/liv/status?limit=7', { headers, cache: 'no-store' });
      const data: StatusResponse = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setHistory(Array.isArray(data.entries) ? data.entries : []);
      setHistoryCounts(data.counts || {});
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Kunne ikke hente historik');
    } finally {
      setHistoryLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    if (!user) return;
    loadPreview();
    loadHistory();
  }, [user, loadPreview, loadHistory]);

  const topic = preview?.topic ?? null;
  const article = preview?.article ?? null;
  const previewImageUrl = preview?.previewImageUrl ?? null;
  const sourceUrl = topic?.source?.url || null;
  const sourceHost = useMemo(() => {
    if (!sourceUrl) return null;
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }, [sourceUrl]);

  const todayLabel = useMemo(() => {
    if (!preview?.dayKey) return null;
    try {
      return new Date(`${preview.dayKey}T00:00:00Z`).toLocaleDateString('da-DK', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      });
    } catch {
      return preview.dayKey;
    }
  }, [preview?.dayKey]);

  const anyBusy = previewLoading || generateLoading;

  if (!user) {
    return (
      <div className={`flex flex-col items-center justify-center text-center p-8 text-white/70 font-poppins ${embedded ? 'h-full' : 'min-h-[100dvh]'}`}>
        <p className="text-[14px] text-white/75">Log ind for at se AI-posting</p>
        <Link href="/auth/sign-in" className={`mt-4 ${pillLink}`}>Log ind</Link>
      </div>
    );
  }

  return (
    <div className={embedded
      ? 'flex flex-col h-full min-h-0 text-white bg-transparent font-poppins'
      : 'min-h-[100dvh] flex flex-col text-white bg-[#0a0a0a] font-poppins'}
    >
      {/* ── Header ── */}
      <header className={embedded
        ? 'border-b border-white/10 px-3 lg:px-4 py-2.5 lg:py-3 flex items-center justify-between gap-3 shrink-0 bg-black/25 backdrop-blur-md'
        : 'border-b border-white/10 px-4 lg:px-5 py-3 lg:py-4 flex items-center justify-between gap-3 shrink-0 bg-[#0c0c0c]'}
      >
        <h1 className={`font-medium tracking-tight text-white ${embedded ? 'text-[15px]' : 'text-[17px]'}`}>AI-posting</h1>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex rounded-lg border border-white/12 p-0.5 gap-0.5 bg-black/30 backdrop-blur-sm" role="group">
            <button type="button" onClick={() => setActiveTab('topic')} className={segBtn(activeTab === 'topic')}>Dagens emne</button>
            <button type="button" onClick={() => setActiveTab('history')} className={segBtn(activeTab === 'history')}>Historik</button>
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} className={closeBtn} aria-label="Luk">
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
          {!embedded && (
            <Link href="/ai" className={pillLink}>← Tilbage</Link>
          )}
        </div>
      </header>

      {/* ── Mobile tab strip ── */}
      <div className="md:hidden flex gap-0.5 p-2 border-b border-white/10 bg-black/25 backdrop-blur-md">
        <button type="button" onClick={() => setActiveTab('topic')} className={`flex-1 ${segBtn(activeTab === 'topic')}`}>Dagens emne</button>
        <button type="button" onClick={() => setActiveTab('history')} className={`flex-1 ${segBtn(activeTab === 'history')}`}>Historik</button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 lg:px-4 py-3 lg:py-4 space-y-3">

          {/* Subtle subtitle row */}
          <div className="flex items-center justify-between text-[11px] text-white/45">
            <span className="truncate">Liv Brandt · auto-publish dagligt{todayLabel ? ` · ${todayLabel}` : ''}</span>
            <button
              type="button"
              onClick={() => { loadPreview(); loadHistory(); }}
              disabled={anyBusy || historyLoading}
              className="text-white/45 hover:text-white/75 transition-colors disabled:opacity-40"
            >
              {previewLoading || historyLoading ? 'Opdaterer…' : 'Opdater'}
            </button>
          </div>

          {error && (
            <p className="text-[13px] text-red-400/95">{error}</p>
          )}

          {/* ═══ TOPIC TAB ═══ */}
          {activeTab === 'topic' && (
            <>
              {/* Dagens emne — kort */}
              <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  <div className="sm:w-32 sm:h-auto h-24 bg-[#141414] border-b sm:border-b-0 sm:border-r border-white/[0.08] flex items-center justify-center relative overflow-hidden flex-shrink-0">
                    {previewImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewImageUrl}
                        alt={sourceHost || 'kilde'}
                        className="w-12 h-12 rounded-lg opacity-90"
                      />
                    ) : (
                      <span className="text-[11px] uppercase tracking-wider text-white/30">Liv</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 px-4 py-3.5">
                    <div className="flex items-center flex-wrap gap-1.5 mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
                        <span className="size-1.5 rounded-full bg-white/40" /> Næste auto-publish
                      </span>
                      {topic ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/55">
                          Score {topic.score}
                        </span>
                      ) : null}
                      {topic?.category ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/55">
                          {topic.category}
                        </span>
                      ) : null}
                    </div>

                    {previewLoading && !topic ? (
                      <p className="text-[13px] text-white/55">Indlæser dagens emne…</p>
                    ) : !topic ? (
                      <div>
                        <p className="text-[13px] font-medium text-white/85 mb-1">Intet emne valgt i dag</p>
                        <p className="text-[12px] text-white/45 leading-relaxed">
                          {preview?.reason || 'Ingen trending-artikler matcher Liv\'s temaer lige nu. Cron\'en springer dagen over og prøver igen i morgen.'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h2 className="text-[15px] font-medium text-white leading-snug mb-1">{topic.title}</h2>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45 mb-2">
                          {topic.source?.sourceName ? <span>{topic.source.sourceName}</span> : null}
                          {topic.source?.publishedAt ? <span>· {formatRelativeDate(topic.source.publishedAt) || topic.source.publishedAt}</span> : null}
                          {sourceHost ? <span>· {sourceHost}</span> : null}
                        </div>
                        {topic.source?.excerpt && (
                          <p className="text-[12px] text-white/65 leading-relaxed line-clamp-3">{topic.source.excerpt}</p>
                        )}
                        {Array.isArray(topic.tags) && topic.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {topic.tags.slice(0, 8).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/55">#{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Action row */}
              {topic && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadPreview({ generate: true })}
                    disabled={generateLoading}
                    className={`flex-1 ${primaryBtn}`}
                  >
                    {generateLoading ? 'Skriver Liv\'s udkast…' : article ? 'Generér nyt udkast' : 'Generér forhåndsvisning'}
                  </button>
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`shrink-0 inline-flex items-center justify-center px-4 py-3 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 transition-all duration-200 active:scale-[0.98]`}
                    >
                      Kilde ↗
                    </a>
                  )}
                </div>
              )}

              {/* Forhåndsvisning */}
              {generateLoading && !article && (
                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4">
                  <p className="text-[12px] text-white/55">Liv skriver udkast — typisk 20-60 sekunder…</p>
                </section>
              )}

              {article && (
                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06]">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
                        <span className="size-1.5 rounded-full bg-emerald-400" /> Forhåndsvisning
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/55">
                        {article.section}
                      </span>
                      <span className="text-[11px] text-white/45">{article.wordCount} ord</span>
                    </div>
                    <span className="text-[11px] text-white/30 truncate max-w-[40%]">/{article.slug}</span>
                  </header>

                  <div className="px-4 py-4 space-y-3">
                    <div>
                      <h2 className="text-[18px] font-medium text-white leading-tight tracking-tight">{article.title}</h2>
                      {article.subtitle && (
                        <p className="text-white/65 text-[13px] mt-1 leading-snug">{article.subtitle}</p>
                      )}
                    </div>

                    {article.intro && (
                      <p className="text-white/85 text-[13px] leading-relaxed border-l border-white/15 pl-3">{article.intro}</p>
                    )}

                    <div className="text-white/75 text-[13px] leading-[1.7] whitespace-pre-wrap">
                      {article.content}
                    </div>

                    <div className="rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-white/45">SEO &amp; META</p>
                      <div>
                        <p className="text-[10px] text-white/45 mb-0.5">Title ({(article.seoTitle || '').length} tegn)</p>
                        <p className="text-[12px] text-white/85">{article.seoTitle || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/45 mb-0.5">Description ({(article.seoDescription || '').length} tegn)</p>
                        <p className="text-[12px] text-white/75 leading-relaxed">{article.seoDescription || '—'}</p>
                      </div>
                      {article.primaryKeyword && (
                        <p className="text-[10px] text-white/45">
                          Primært keyword: <span className="text-white/65">{article.primaryKeyword}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ═══ HISTORY TAB ═══ */}
          {activeTab === 'history' && (
            <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06]">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-white/80">Seneste 7 dage</p>
                  {historyCounts && Object.keys(historyCounts).length > 0 && (
                    <p className="text-[10px] text-white/30 truncate">
                      {Object.entries(historyCounts)
                        .map(([k, v]) => `${STATUS_META[k as LivStatus]?.label || k}: ${v}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => loadHistory()}
                  disabled={historyLoading}
                  className="text-[11px] text-white/45 hover:text-white/75 disabled:opacity-50 transition-colors"
                >
                  {historyLoading ? 'Henter…' : 'Opdater'}
                </button>
              </header>

              <div className="px-3 py-2">
                {historyError && (
                  <p className="text-[12px] text-red-400/95 px-1 py-1">{historyError}</p>
                )}

                {history.length === 0 && !historyLoading && !historyError ? (
                  <p className="text-[12px] text-white/45 px-1 py-2">
                    Ingen kørsler endnu — første cron-køring sker kl. 08:00 UTC.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {history.map((h) => {
                      const meta = STATUS_META[h.status] || { label: h.status, tone: 'idle' as const };
                      return (
                        <li
                          key={h.id}
                          className="flex items-start gap-3 px-3 py-2 rounded-lg border border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                        >
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70 whitespace-nowrap mt-0.5">
                            <span className={`size-1.5 rounded-full ${TONE_DOT[meta.tone]}`} /> {meta.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-white/85 truncate">{h.title || h.topic || '—'}</p>
                            <p className="text-[10px] text-white/35 truncate">
                              {h.dayKey} · {formatDateDk(h.finishedAt)}
                              {h.reason ? ` · ${h.reason}` : ''}
                            </p>
                          </div>
                          {h.slug && h.status === 'published' && (
                            <a
                              href={`https://aproposmagazine.com/artikler/${h.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-white/55 hover:text-white/85 flex-shrink-0 mt-0.5"
                            >
                              Åbn ↗
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* Footer hint */}
          <p className="text-[10px] text-white/30 px-1 pt-1">
            Cron kører kl. 08:00 UTC. Test uden publish: <code className="text-white/55">/api/cron/liv-daily-article?dryRun=1</code>
          </p>
        </div>
      </div>

      {/* Secondary action — fixed in footer area for parity with newsletter */}
      {topic && activeTab === 'topic' && (
        <div className="border-t border-white/10 px-3 lg:px-4 py-2.5 bg-black/25 backdrop-blur-md">
          <button
            type="button"
            onClick={() => loadPreview()}
            disabled={previewLoading}
            className={secondaryBtn}
          >
            {previewLoading ? 'Henter nyt emne…' : 'Vælg nyt emne'}
          </button>
        </div>
      )}
    </div>
  );
}
