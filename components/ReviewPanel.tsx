'use client';

import WebflowPublishPanel from './WebflowPublishPanel';

interface ReviewPanelProps {
  articleData: any;
  onClose?: () => void;
  frameless?: boolean; // when true, caller provides outer container/style
}

export default function ReviewPanel({ articleData, onClose, frameless }: ReviewPanelProps) {
  const title = articleData?.title || articleData?.previewTitle || 'Arbejdstitel (ikke sat)';
  const subtitle = articleData?.subtitle || '';
  const author = articleData?.author || '—';
  const category = articleData?.category || articleData?.section || '—';
  const topic = (articleData?.tags || [])[1] || articleData?.topic || '';
  const rating = articleData?.rating || 0;
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
  const publishDate = articleData?.publishDate || '';
  const aiDraft = articleData?.aiDraft;

  const paragraphs = content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const Body = (
    <div className="text-white space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/50">Article preview</div>
        {onClose && (
          <button onClick={onClose} className="text-white/60 hover:text-white text-xs">Luk</button>
        )}
      </div>

      <header className="space-y-3">
        <div className="text-xs uppercase tracking-wide text-white/40">Titel</div>
        <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-white/70 text-base leading-relaxed">{subtitle}</p>}
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
          <span>Af {author}</span>
          {category && (<span className="inline-flex items-center gap-1 text-white/50"><span className="w-1 h-1 rounded-full bg-white/40"></span>{category}</span>)}
          {topic && (<span className="inline-flex items-center gap-1 text-white/50"><span className="w-1 h-1 rounded-full bg-white/40"></span>{topic}</span>)}
          {rating>0 && <span className="text-emerald-200">{rating} ⭐</span>}
          {formattedTags(articleData).map((tag)=> (
            <span key={tag} className="px-2 py-0.5 bg-white/10 text-white/60 rounded-full">{tag}</span>
          ))}
        </div>
      </header>

      <section className="space-y-3 text-sm leading-6 text-white/85">
        {paragraphs.length
          ? paragraphs.map((p, i) => (<p key={i}>{p}</p>))
          : <p className="text-white/50">Din artikeltekst vises her, så snart indholdet er genereret.</p>
        }
      </section>

      <section className="grid grid-cols-2 gap-3 text-xs">
        <Field k="Author" v={author} />
        <Field k="Section" v={category} />
        <Field k="Topic" v={topic} />
        <Field k="Platform/Service" v={platform} />
        <Field k="Tags" v={formattedTags(articleData).join(', ')} />
        <Field k="Slug" v={slug} />
        <Field k="Publiceringsdato" v={String(publishDate)} />
        <Field k="SEO Titel" v={seoTitle} />
        <Field k="SEO Beskrivelse" v={seoDescription} />
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

      <section className="border-t border-white/10 pt-4">
        <WebflowPublishPanel
          articleData={articleData}
          onPublish={async ()=>{}}
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
