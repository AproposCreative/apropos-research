'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';

interface SourceItem {
  id: string;
  name: string;
  baseUrl: string;
  sitemapIndex: string;
  enabled: boolean;
  addedAt?: string;
  createdAt?: string;
  preset?: boolean;
}

const PREMADE_SOURCES: Omit<SourceItem, 'addedAt' | 'createdAt'>[] = [
  { id: 'soundvenue', name: 'Soundvenue', baseUrl: 'https://soundvenue.com', sitemapIndex: '/sitemap.xml', enabled: true, preset: true },
  { id: 'gaffa', name: 'GAFFA', baseUrl: 'https://gaffa.dk', sitemapIndex: '/sitemap', enabled: true, preset: true },
  { id: 'berlingske', name: 'Berlingske', baseUrl: 'https://www.berlingske.dk', sitemapIndex: '/sitemap.xml/news', enabled: true, preset: true },
  { id: 'bt', name: 'BT', baseUrl: 'https://www.bt.dk', sitemapIndex: '/sitemap.xml/news', enabled: true, preset: true },
  { id: 'ign-nordic', name: 'IGN Nordic', baseUrl: 'https://nordic.ign.com', sitemapIndex: '/sitemap.xml', enabled: false, preset: true },
  { id: 'ekkofilm', name: 'Ekkofilm', baseUrl: 'https://www.ekkofilm.dk', sitemapIndex: '/sitemap.xml', enabled: false, preset: true },
  { id: 'information', name: 'Information', baseUrl: 'https://www.information.dk', sitemapIndex: '/sitemap.xml', enabled: false, preset: true },
  { id: 'politiken', name: 'Politiken', baseUrl: 'https://politiken.dk', sitemapIndex: '/sitemap.xml', enabled: false, preset: true },
  { id: 'dr-kultur', name: 'DR Kultur', baseUrl: 'https://www.dr.dk/kultur', sitemapIndex: '/sitemap.xml', enabled: false, preset: true },
];

const CATEGORY_MAP: Record<string, string> = {
  'soundvenue': 'Musik & Kultur',
  'gaffa': 'Musik',
  'berlingske': 'Nyheder',
  'bt': 'Nyheder',
  'ign-nordic': 'Gaming',
  'ekkofilm': 'Film',
  'information': 'Kultur & Debat',
  'politiken': 'Kultur',
  'dr-kultur': 'Kultur',
};

export default function SourcesPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const res = await fetch('/api/media-sources', { headers: { 'x-user-id': user.uid } });
      const json = await res.json();
      const fetched: SourceItem[] = json.data?.sources || json.sources || [];

      const merged = PREMADE_SOURCES.map(preset => {
        const existing = fetched.find(s => s.id === preset.id || s.name.toLowerCase() === preset.name.toLowerCase());
        if (existing) return { ...existing, preset: true };
        return { ...preset, addedAt: new Date().toISOString() };
      });

      const customSources = fetched.filter(s =>
        !PREMADE_SOURCES.some(p => p.id === s.id || p.name.toLowerCase() === s.name.toLowerCase())
      );

      setSources([...merged, ...customSources]);
    } catch {
      setSources(PREMADE_SOURCES.map(p => ({ ...p, addedAt: new Date().toISOString() })));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) loadSources();
    if (!isOpen) setAddFormOpen(false);
  }, [isOpen, loadSources]);

  const toggleSource = async (source: SourceItem) => {
    if (!user) return;
    setTogglingId(source.id);
    const newEnabled = !source.enabled;

    setSources(prev => prev.map(s => s.id === source.id ? { ...s, enabled: newEnabled } : s));

    try {
      if (!sources.some(s => s.id === source.id && s.addedAt)) {
        await fetch('/api/media-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': user.uid },
          body: JSON.stringify({ name: source.name, baseUrl: source.baseUrl, sitemapIndex: source.sitemapIndex, enabled: newEnabled }),
        });
      } else {
        await fetch(`/api/media-sources?id=${source.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-user-id': user.uid },
          body: JSON.stringify({ name: source.name, baseUrl: source.baseUrl, sitemapIndex: source.sitemapIndex, enabled: newEnabled }),
        });
      }
    } catch {
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, enabled: !newEnabled } : s));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (source: SourceItem) => {
    if (!user || source.preset) return;
    setSources(prev => prev.filter(s => s.id !== source.id));
    try {
      await fetch(`/api/media-sources?id=${source.id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.uid },
      });
    } catch {
      loadSources();
    }
  };

  const handleAddComplete = () => {
    setAddFormOpen(false);
    loadSources();
  };

  if (!isOpen) return null;

  const enabledCount = sources.filter(s => s.enabled).length;
  const presetSources = sources.filter(s => s.preset);
  const customSources = sources.filter(s => !s.preset);

  return (
    <div className="h-full flex flex-col bg-[#171717] md:rounded-xl border-l md:border border-white/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div>
          <h2 className="text-white font-medium text-sm">Mediekilder</h2>
          <p className="text-white/40 text-[11px] mt-0.5">{enabledCount} aktive kilder</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddFormOpen(v => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
              addFormOpen
                ? 'bg-white/20 text-white'
                : 'bg-white/10 hover:bg-white/15 text-white/80 hover:text-white'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`transition-transform duration-300 ${addFormOpen ? 'rotate-45' : ''}`}>
              <path d="M12 5v14M5 12h14"/>
            </svg>
            {addFormOpen ? 'Luk' : 'Tilføj'}
          </button>
          <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white rounded-lg transition-colors" aria-label="Luk">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* Inline add form -- expands down, pushing content */}
        <InlineAddForm
          isOpen={addFormOpen}
          onComplete={handleAddComplete}
          onCancel={() => setAddFormOpen(false)}
        />

        <div className="p-3 space-y-4">
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium mb-2 px-1">Foreslåede kilder</p>
                <div className="space-y-1.5">
                  {presetSources.map(source => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      toggling={togglingId === source.id}
                      onToggle={() => toggleSource(source)}
                      category={CATEGORY_MAP[source.id]}
                    />
                  ))}
                </div>
              </div>

              {customSources.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium mb-2 px-1">Dine egne kilder</p>
                  <div className="space-y-1.5">
                    {customSources.map(source => (
                      <SourceCard
                        key={source.id}
                        source={source}
                        toggling={togglingId === source.id}
                        onToggle={() => toggleSource(source)}
                        onDelete={() => handleDelete(source)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {customSources.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-white/30 text-xs">Ingen egne kilder endnu</p>
                  <button
                    onClick={() => setAddFormOpen(true)}
                    className="mt-2 text-white/50 hover:text-white text-xs underline underline-offset-2 transition-colors"
                  >
                    Tilføj en kilde
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline expanding add-form                                          */
/* ------------------------------------------------------------------ */
function InlineAddForm({ isOpen, onComplete, onCancel }: {
  isOpen: boolean;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [sitemapIndex, setSitemapIndex] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [autoFilling, setAutoFilling] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        if (innerRef.current) setMeasuredHeight(innerRef.current.scrollHeight);
        setTimeout(() => nameRef.current?.focus(), 400);
      });
    } else {
      setName(''); setBaseUrl(''); setSitemapIndex(''); setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && innerRef.current) {
      setMeasuredHeight(innerRef.current.scrollHeight);
    }
  }, [isOpen, name, baseUrl, sitemapIndex, error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !baseUrl || !sitemapIndex || !user) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/media-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.uid },
        body: JSON.stringify({ name, baseUrl, sitemapIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fejl');
      setName(''); setBaseUrl(''); setSitemapIndex('');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'En fejl opstod');
    } finally {
      setSubmitting(false);
    }
  };

  const autoFill = async () => {
    if (!baseUrl || autoFilling) return;
    setAutoFilling(true);
    const paths = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap', '/wp-sitemap.xml', '/feed.xml', '/rss.xml'];
    for (const p of paths) {
      try {
        const res = await fetch('/api/validate-media-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl, sitemapIndex: p }),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const json = await res.json();
          const d = json.data || json;
          if (d.sitemapAccessible && d.hasArticles) {
            setSitemapIndex(p);
            break;
          }
        }
      } catch { /* continue */ }
    }
    setAutoFilling(false);
  };

  return (
    <div
      ref={containerRef}
      className="overflow-hidden"
      style={{
        height: isOpen ? `${measuredHeight}px` : '0px',
        opacity: isOpen ? 1 : 0,
        transition: 'height 500ms cubic-bezier(0.16, 1, 0.3, 1), opacity 400ms ease',
      }}
    >
      <div ref={innerRef}>
        <form onSubmit={handleSubmit} className="bg-black rounded-xl p-2 md:p-3 mx-3 mt-3 space-y-[14px]">
          <div className="text-white/80 text-sm">Tilføj ny kilde</div>

          {error && <p className="text-red-400/80 text-xs">{error}</p>}

          <div className="space-y-2">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="Medienavn"
              className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
              required
            />

            <input
              type="url"
              value={baseUrl}
              onChange={e => { setBaseUrl(e.target.value); setError(''); }}
              placeholder="https://www.example.com"
              className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
              required
            />

            <div className="flex gap-2">
              <input
                type="text"
                value={sitemapIndex}
                onChange={e => { setSitemapIndex(e.target.value); setError(''); }}
                placeholder="/sitemap.xml"
                className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
                required
              />
              <button
                type="button"
                onClick={autoFill}
                disabled={autoFilling || !baseUrl}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
                  autoFilling
                    ? 'bg-white/10 text-white border-white/40'
                    : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'
                } disabled:opacity-30`}
              >
                {autoFilling ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : 'Auto'}
              </button>
            </div>
          </div>

          <div className="flex gap-x-[16px]">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={submitting || !name || !baseUrl || !sitemapIndex}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all border flex items-center gap-1.5 ${
                !submitting && name && baseUrl && sitemapIndex
                  ? 'bg-white/10 text-white border-white/40 hover:bg-white/15'
                  : 'bg-white/5 text-white/30 border-white/10'
              }`}
            >
              {submitting && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {submitting ? 'Tilføjer...' : 'Tilføj kilde'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source card                                                         */
/* ------------------------------------------------------------------ */
function SourceCard({
  source,
  toggling,
  onToggle,
  onDelete,
  category,
}: {
  source: SourceItem;
  toggling: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  category?: string;
}) {
  return (
    <div className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 ${
      source.enabled
        ? 'bg-white/[0.06] border-white/15 hover:border-white/25'
        : 'bg-transparent border-white/[0.06] hover:border-white/12'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-opacity ${
        source.enabled ? 'opacity-100' : 'opacity-40'
      }`} style={{ background: `hsl(${hashToHue(source.name)} 50% 25%)` }}>
        {source.name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate transition-colors ${source.enabled ? 'text-white' : 'text-white/40'}`}>
            {source.name}
          </span>
          {category && (
            <span className="text-[9px] uppercase tracking-wider text-white/25 whitespace-nowrap">{category}</span>
          )}
        </div>
        <span className={`text-[11px] truncate block transition-colors ${source.enabled ? 'text-white/40' : 'text-white/20'}`}>
          {source.baseUrl.replace(/^https?:\/\/(www\.)?/, '')}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {onDelete && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-red-400 transition-all"
            title="Slet kilde"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
        <button
          onClick={onToggle}
          disabled={toggling}
          className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${
            source.enabled ? 'bg-emerald-500/80' : 'bg-white/10'
          } ${toggling ? 'opacity-50' : ''}`}
          role="switch"
          aria-checked={source.enabled}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            source.enabled ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </button>
      </div>
    </div>
  );
}

function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hues = [210, 260, 330, 20, 150, 190, 280, 45];
  return hues[Math.abs(hash) % hues.length];
}
