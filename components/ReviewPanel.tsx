'use client';

import { useEffect, useState } from 'react';
import WebflowPublishPanel from './WebflowPublishPanel';
import type { WebflowArticleFields } from '@/lib/webflow-service';

interface ReviewPanelProps {
  articleData: any;
  onClose?: () => void;
  frameless?: boolean; // when true, caller provides outer container/style
}

export default function ReviewPanel({ articleData, onClose, frameless }: ReviewPanelProps) {
  const [siteMock, setSiteMock] = useState(false);
  const [wfSlugs, setWfSlugs] = useState<string[] | null>(null);
  const title = articleData?.title || articleData?.previewTitle || 'Arbejdstitel (ikke sat)';
  const subtitle = articleData?.subtitle || '';
  const author = articleData?.author || '—';
  const category = articleData?.category || articleData?.section || '—';
  const topic = (articleData?.tags || [])[1] || articleData?.topic || '';
  const rating = articleData?.rating || 0;
  const starBox = rating > 0 ? `${'★'.repeat(Math.min(6, rating))}${'☆'.repeat(Math.max(0, 6 - Math.min(6, rating)))} (${rating}/6)` : '';
  // Fallbacks: use content, post-body, or last assistant reply from _chatMessages
  let content: string = articleData?.content || articleData?.['post-body'] || '';
  if (!content && Array.isArray(articleData?._chatMessages)) {
    const assistants = (articleData._chatMessages as any[]).filter(m => m.role === 'assistant');
    const last = assistants[assistants.length - 1]?.content as string | undefined;
    if (last) content = last;
  }
  if (!content) content = 'Her vil artikelindholdet blive vist, når du begynder at skrive i chatten.';

  const seoTitle = articleData?.seo_title || articleData?.seoTitle || '';
  const seoDescription = articleData?.meta_description || articleData?.seoDescription || '';
  const slug = articleData?.slug || '';
  const platform = articleData?.platform || articleData?.streaming_service || '';
  const reflection = articleData?.reflection || '';
  const aiDraft = articleData?.aiDraft;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/webflow/article-fields');
        if (res.ok) {
          const j = await res.json();
          const slugs = Array.isArray(j?.fields) ? j.fields.map((f: any) => f.slug).filter(Boolean) : [];
          setWfSlugs(slugs);
        }
      } catch {}
    })();
  }, []);

  const paragraphs = content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  

  // Calculate word count and reading time from content (only if it's real content, not placeholder)
  const isPlaceholder = content === 'Her vil artikelindholdet blive vist, når du begynder at skrive i chatten.';
  const wordCount = (content && !isPlaceholder) ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  const readTime = wordCount ? Math.ceil(wordCount / 200) : 0;

  const has = (...aliases: string[]) => {
    if (!wfSlugs || wfSlugs.length === 0) return true; // optimistic until loaded
    const set = new Set(wfSlugs.map((s) => String(s).toLowerCase()));
    return aliases.some((a) => set.has(a.toLowerCase()));
  };

  const Body = (
    <div className="text-white space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/50">Article preview</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSiteMock(v => !v)}
            title={siteMock ? 'Skift til standard preview' : 'Vis live‑site mock'}
            className="text-white/60 hover:text-white transition-colors"
          >
            {/* Globe icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M2 12h20"></path>
              <path d="M12 2c2.5 3 2.5 15 0 20c-2.5-5-2.5-15 0-20z"></path>
            </svg>
          </button>
          {onClose && (
            <button onClick={onClose} className="text-white/60 hover:text-white text-xs">Luk</button>
          )}
        </div>
      </div>

      {siteMock ? (
        <header className="rounded-xl overflow-hidden border border-white/10">
          <div className="bg-white text-black p-6">
            <div className="text-xs uppercase tracking-wide text-rose-600 font-semibold">{category || 'Sektion'}</div>
            <h1 className="mt-2 text-3xl md:text-4xl font-semibold leading-tight">{title}</h1>
            {subtitle && <p className="mt-3 text-lg text-neutral-700 leading-relaxed">{subtitle}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
              <span className="font-medium">{author}</span>
              {rating>0 && (
                <span className="px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200">{rating}/6 ⭐</span>
              )}
              {[category, topic, platform].filter(Boolean).map((t, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200">{String(t)}</span>
              ))}
            </div>
          </div>
        </header>
      ) : (
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          <p className="text-white/70 text-base leading-relaxed">{subtitle || 'Undertitel'}</p>
        </header>
      )}

      <section className="space-y-3 text-sm leading-6 text-white/85">
        {paragraphs.length
          ? paragraphs.map((p, i) => (<p key={i}>{p}</p>))
          : <p className="text-white/50">Din artikeltekst vises her, så snart indholdet er genereret.</p>
        }
      </section>

      <section className="grid grid-cols-2 gap-3 text-xs">
        <Field k="Name (Titel)" v={title || '—'} />
        {has('subtitle','sub-title') && <Field k="Undertitel" v={subtitle || '—'} />}
        {has('author') && <Field k="Author" v={author} />}
        {has('section','category') && <Field k="Section" v={category} />}
        {has('topic','topics') && <Field k="Topic" v={topic} />}
        <Field k="Platform/Service" v={platform || '—'} />
        <Field k="Stjerner" v={starBox || '—'} />
        {has('slug') && <Field k="Slug" v={slug || '—'} />}
        <Field k="Antal ord" v={wordCount > 0 ? wordCount.toString() : '—'} />
        <Field k="Min læsetid" v={readTime > 0 ? readTime.toString() : '—'} />
        <Field k="SEO Titel" v={seoTitle || '—'} />
        <Field k="Meta Beskrivelse" v={seoDescription || '—'} />
        {reflection && (
          <div className="col-span-2">
            <div className="text-white/60 mb-1">Refleksion</div>
            <div className="text-white/80 text-sm whitespace-pre-wrap">{reflection}</div>
          </div>
        )}
        {aiDraft?.prompt && (
          <div className="col-span-2">
            <div className="text-white/60 mb-1">AI Prompt</div>
            <div className="text-white/80 text-sm whitespace-pre-wrap">{aiDraft.prompt}</div>
          </div>
        )}
      </section>

      <section>
        <WebflowPublishPanel
          articleData={articleData}
          onPublish={async (formData: WebflowArticleFields) => {
            try {
              const res = await fetch('/api/webflow/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
              });
              const j = await res.json().catch(()=>null);
              if (!res.ok) {
                const msg = j?.details || j?.error || 'Udgivelse fejlede';
                alert(msg);
                return;
              }
              alert(`Udgivet! ID: ${j?.articleId || 'ukendt'}`);
            } catch (e: any) {
              alert(String(e?.message || e || 'Uventet fejl'));
            }
          }}
          onClose={() => {}}
          embed
        />
      </section>
    </div>
  );

  if (frameless) return Body;

  return (
    <div className="rounded-xl bg-[#171717] text-white p-4 max-h-[420px] overflow-y-auto">
      {Body}
    </div>
  );
}

function Field({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-2">
      <div className="text-white/50">{k}</div>
      <div className="text-white/80 truncate" title={v}>{v}</div>
    </div>
  );
}

function formattedTags(data: any): string[] {
  const base = Array.isArray(data?.tags) ? data.tags : [];
  const extras = [data?.category, data?.topic].filter(Boolean);
  const unique = Array.from(new Set([...base, ...extras].map((tag:any)=> String(tag).trim()).filter(Boolean)));
  return unique;
}
