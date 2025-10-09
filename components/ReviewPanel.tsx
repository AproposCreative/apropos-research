'use client';

interface ReviewPanelProps {
  articleData: any;
  onClose?: () => void;
  frameless?: boolean; // when true, caller provides outer container/style
}

export default function ReviewPanel({ articleData, onClose, frameless }: ReviewPanelProps) {
  const title = articleData?.title || 'Arbejdstitel (ikke sat)';
  const subtitle = articleData?.subtitle || '';
  const author = articleData?.author || '—';
  const category = articleData?.category || articleData?.section || '—';
  const topic = (articleData?.tags || [])[1] || articleData?.topic || '';
  const rating = articleData?.rating || 0;
  const content = articleData?.content || 'Her vil artikelindholdet blive vist, når du begynder at skrive i chatten.';

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

      {/* Body mock */}
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
    </div>
  );

  if (frameless) return Body;

  return (
    <div className="rounded-xl bg-[#171717] text-white p-4 max-h-[420px] overflow-y-auto">
      {Body}
    </div>
  );
}


