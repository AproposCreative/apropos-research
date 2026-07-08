'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import { useAuth } from '@/lib/auth-context';
import type { PushAudience, PushDestinationKind } from '@/lib/push/types';

const primaryBtn =
  'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

const secondaryBtn =
  'w-full py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

const fieldClass =
  'apropos-input-dark w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2.5 text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]';

const DESTINATIONS: Array<{ id: PushDestinationKind; label: string; hint: string }> = [
  { id: 'none', label: 'Ingen deeplink', hint: 'Åbner appen uden at navigere' },
  { id: 'article', label: 'Artikel', hint: 'Åbner artiklen i appen' },
  { id: 'podcast', label: 'Podcast', hint: 'Åbner artikel + podcast-afspiller' },
];

type HistoryItem = {
  id: string;
  title: string;
  body: string;
  destination: PushDestinationKind;
  articleSlug: string | null;
  topic: string;
  imageUrl: string | null;
  createdAt: string | null;
};

type PushDeskClientProps = {
  embedded?: boolean;
  onClose?: () => void;
};

export default function PushDeskClient({ embedded = false, onClose }: PushDeskClientProps) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [destination, setDestination] = useState<PushDestinationKind>('article');
  const [articleSlug, setArticleSlug] = useState('');
  const [audience, setAudience] = useState<PushAudience>('all_users');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const idToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const loadHistory = useCallback(async () => {
    const token = await idToken();
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/push/history?limit=12', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.ok) setHistory(data.items || []);
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const needsSlug = destination !== 'none';
  const canSend = useMemo(() => {
    if (!title.trim()) return false;
    if (needsSlug && !articleSlug.trim()) return false;
    return true;
  }, [title, needsSlug, articleSlug]);

  const uploadImage = async (file: File) => {
    const token = await idToken();
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/push/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload fejlede');
      setImageUrl(data.url);
      setImageName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fejlede');
    } finally {
      setUploading(false);
    }
  };

  const sendPush = async () => {
    const token = await idToken();
    if (!token) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim() || title.trim(),
          imageUrl: imageUrl || undefined,
          destination,
          articleSlug: needsSlug ? articleSlug.trim() : undefined,
          audience,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send fejlede');
      setSuccess(`Sendt til FCM-emne: ${data.topic || 'new_articles'}`);
      setTitle('');
      setBody('');
      setArticleSlug('');
      setImageUrl(null);
      setImageName(null);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send fejlede');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col bg-transparent font-poppins text-white'
          : 'min-h-[100dvh] flex flex-col font-poppins bg-[#0a0a0a] text-white'
      }
    >
      <EmbeddedAppHeader embedded={embedded} title="Push" onClose={onClose} showBackLink={!embedded} />

      <main className="flex-1 min-h-0 overflow-y-auto nice-scrollbar p-4 lg:p-5 space-y-4">
        <section className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Overskrift</span>
            <input
              className={fieldClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fx: Ny artikel ude nu"
              maxLength={120}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Brødtekst</span>
            <textarea
              className={fieldClass + ' min-h-[72px] resize-y'}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Valgfri — vises under overskriften i notifikationen"
              rows={3}
              maxLength={280}
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Billede</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadImage(f);
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={secondaryBtn + ' !w-auto px-4'}
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? 'Uploader…' : imageUrl ? 'Skift billede' : 'Vælg billede'}
              </button>
              {imageName ? (
                <span className="text-[11px] text-white/45 truncate max-w-[200px]">{imageName}</span>
              ) : null}
              {imageUrl ? (
                <button
                  type="button"
                  className="text-[11px] text-white/45 hover:text-white/75"
                  onClick={() => {
                    setImageUrl(null);
                    setImageName(null);
                  }}
                >
                  Fjern
                </button>
              ) : null}
            </div>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="mt-2 max-h-32 rounded-lg border border-white/10 object-cover"
              />
            ) : null}
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Åbn i appen</span>
            <div className="grid gap-2">
              {DESTINATIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDestination(d.id)}
                  className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-all duration-200 active:scale-[0.98] text-left ${
                    destination === d.id
                      ? 'border-white/15 bg-white/[0.05]'
                      : 'border-white/[0.06] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-white/80">{d.label}</p>
                    <p className="text-[10px] text-white/30">{d.hint}</p>
                  </div>
                  <span
                    className={`size-3.5 shrink-0 rounded-full border ${
                      destination === d.id ? 'border-white/40 bg-white/25' : 'border-white/15'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {needsSlug ? (
            <label className="block space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Artikel-link</span>
              <input
                className={fieldClass}
                value={articleSlug}
                onChange={(e) => setArticleSlug(e.target.value)}
                placeholder="slug eller https://www.aproposmagazine.com/articles/…"
              />
            </label>
          ) : null}

          {destination === 'none' ? (
            <label className="block space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Målgruppe</span>
              <select
                className={fieldClass + ' h-10'}
                value={audience}
                onChange={(e) => setAudience(e.target.value as PushAudience)}
              >
                <option value="all_users">Breaking news-abonnenter</option>
                <option value="new_articles">Artikel-abonnenter</option>
              </select>
            </label>
          ) : (
            <p className="text-[11px] text-white/40 leading-relaxed">
              {destination === 'podcast'
                ? 'Sendes til podcast-abonnenter (new_podcasts).'
                : 'Sendes til artikel-abonnenter (new_articles).'}
            </p>
          )}

          {error ? <p className="text-red-400/95 text-[12px]">{error}</p> : null}
          {success ? (
            <p className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[12px] text-white/70">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {success}
              </span>
            </p>
          ) : null}

          <button
            type="button"
            className={primaryBtn}
            disabled={!canSend || sending || uploading}
            onClick={() => void sendPush()}
          >
            {sending ? 'Sender…' : 'Send push-notifikation'}
          </button>
        </section>

        <section className="space-y-2 pt-2 border-t border-white/[0.06]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium">Seneste sends</p>
          {historyLoading ? (
            <p className="text-[12px] text-white/35">Henter…</p>
          ) : history.length === 0 ? (
            <p className="text-[12px] text-white/35">Ingen sends endnu</p>
          ) : (
            <ul className="space-y-2">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                >
                  <p className="text-[13px] font-medium text-white/85">{item.title}</p>
                  <p className="mt-0.5 text-[10px] text-white/35">
                    {item.destination}
                    {item.articleSlug ? ` · ${item.articleSlug}` : ''}
                    {item.createdAt
                      ? ` · ${new Date(item.createdAt).toLocaleString('da-DK', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
