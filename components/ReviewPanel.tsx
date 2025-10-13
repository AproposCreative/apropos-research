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

  const Body = (
    <div className="text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-white/60">Preview • {category}{topic?` • ${topic}`:''}</div>
        {onClose && (
          <button onClick={onClose} className="text-white/60 hover:text-white text-xs">Luk</button>
        )}
      </div>

      {/* Title */}
      <h1 className="text-xl font-semibold mb-1">{title}</h1>
      {subtitle && <p className="text-white/70 mb-3">{subtitle}</p>}

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-white/60 mb-4">
        <span>Af {author}</span>
        {rating>0 && <span className="text-white/80">{rating} ⭐</span>}
      </div>

      {/* Body preview */}
      <div className="space-y-3 text-sm leading-6 text-white/80">
        {content.split('\n').slice(0, 6).map((p: string, i: number) => (
          <p key={i}>{p || ' '}</p>
        ))}
        {content.length < 30 && (
          <>
            <p>—</p>
            <p className="text-white/50">Tip: Brug chatten til at udfylde titel, indledning og brødtekst. Preview opdateres live.</p>
          </>
        )}
      </div>

      {/* CMS fields overview */}
      <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
        <Field k="Author" v={author} />
        <Field k="Section" v={category} />
        <Field k="Topic" v={topic} />
        <Field k="Platform/Service" v={platform} />
        <Field k="Slug" v={slug} />
        <Field k="Tags" v={(articleData?.tags || []).join(', ')} />
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
      </div>

      {/* Inline publish form (replaces overlay) */}
      <div className="mt-6 border-t border-white/10 pt-4">
        <WebflowPublishPanel
          articleData={articleData}
          onPublish={async ()=>{}}
          onClose={() => {}}
          embed
        />
      </div>
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


