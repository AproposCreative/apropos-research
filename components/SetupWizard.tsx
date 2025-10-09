'use client';

import { useEffect, useMemo, useState } from 'react';
import { WebflowAuthor } from '@/lib/webflow-service';

type Step = 'author' | 'section' | 'topic' | 'press' | 'rating' | 'review';

interface SetupWizardProps {
  initialData?: any;
  onComplete: (articleData: any) => void;
  onChange?: (data: any) => void;
}

const sections = ['Kultur','Musik','Serier','Film'];
const topicsBySection: Record<string,string[]> = {
  Kultur: ['Anmeldelser','Bøger','Debat','Perspektiv'],
  Musik: ['Anmeldelser','Koncerter','Album','Interview'],
  Serier: ['Anmeldelser','Premiere','Analyser','Interview'],
  Film: ['Anmeldelser','Premiere','Festival','Interview']
};

export default function SetupWizard({ initialData, onComplete, onChange }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('author');
  const [authors, setAuthors] = useState<WebflowAuthor[]>([]);
  const [loadingAuthors, setLoadingAuthors] = useState(true);
  const [data, setData] = useState<any>({
    author: initialData?.author || '',
    authorId: initialData?.authorId || '',
    authorTOV: initialData?.authorTOV || '',
    section: initialData?.section || '',
    topic: initialData?.topic || '',
    rating: initialData?.rating || 0,
    press: initialData?.press || false,
    title: initialData?.title || '',
    subtitle: initialData?.subtitle || '',
    tags: initialData?.tags || []
  });

  // Load authors from Webflow
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/webflow/authors');
        const j = await res.json();
        setAuthors(j.authors || []);
      } catch {} finally { setLoadingAuthors(false); }
    };
    run();
  }, []);

  const topics = useMemo(()=> topicsBySection[data.section] || [], [data.section]);

  const nextStep = (from: Step) => {
    if (from==='author') return setStep('section');
    if (from==='section') return setStep('topic');
    if (from==='topic') return setStep('press');
    if (from==='press') return setStep('rating');
    if (from==='rating') return setStep('review');
  };

  const updateData = (updater: (d:any)=>any, advanceFrom?: Step) => {
    setData((prev:any)=>{
      const nd = typeof updater==='function' ? updater(prev) : prev;
      try { onChange?.(nd); } catch {}
      return nd;
    });
    if (advanceFrom) nextStep(advanceFrom);
  };

  const StepChip = ({active, done, label, onClick}:{active:boolean;done:boolean;label:string;onClick:()=>void}) => (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'text-white border-white/60 bg-white/10' : 'text-white/70 border-white/20 hover:border-white/40'} ${done ? 'shadow-[0_0_12px_rgba(255,255,255,0.35)]' : ''}`}
    >
      {label}
    </button>
  );

  const isReview = step === 'review';

  const canContinue = () => {
    if (step==='author') return !!data.authorId || !!data.author;
    if (step==='section') return !!data.section;
    if (step==='topic') return !!data.topic;
    if (step==='rating') return data.rating>0 || topics.indexOf('Anmeldelser')===-1;
    return true;
  };

  const complete = () => {
    const tags = Array.from(new Set([data.section, data.topic].filter(Boolean)));
    onComplete({
      author: data.author,
      authorId: data.authorId,
      authorTOV: data.authorTOV,
      category: data.section,
      tags,
      rating: data.rating,
      press: data.press,
      title: data.title,
      subtitle: data.subtitle
    });
  };

  const Progress = () => {
    const segments = [
      (!!data.authorId || !!data.author),
      (!!data.section),
      (!!data.topic),
      (data.topic==='Anmeldelser' ? (data.rating>0) : false),
      (!!data.title)
    ];
    return (
      <div className="w-full flex gap-1 mb-3">
        {segments.map((ok, i)=>(
          <div key={i} className={`h-1.5 flex-1 rounded ${ok ? 'bg-white shadow-[0_0_10px_#fff]' : 'bg-white/10'}`}></div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-black rounded-xl p-3">
      {/* Stepper */}
      <div className="flex items-center gap-[14px] mb-[14px]">
        <StepChip active={step==='author'} done={!!data.authorId || !!data.author} label="Author" onClick={()=>setStep('author')} />
        <StepChip active={step==='section'} done={!!data.section} label="Section" onClick={()=>setStep('section')} />
        <StepChip active={step==='topic'} done={!!data.topic} label="Topic" onClick={()=>setStep('topic')} />
        <StepChip active={step==='press'} done={data.press===true} label="Press" onClick={()=>setStep('press')} />
        <StepChip active={step==='rating'} done={data.rating>0} label="Rating" onClick={()=>setStep('rating')} />
        <StepChip active={step==='review'} done={false} label="Review" onClick={()=>setStep('review')} />
      </div>

      {/* Progress */}
      <div className="mt-[14px]"><Progress /></div>

      {/* Content */}
      {step==='author' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg forfatter</div>
          <div className="flex flex-wrap gap-[14px]">
            {loadingAuthors ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : authors.map(a=> {
              const selected = data.authorId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, author: '', authorId: '', authorTOV: '' }))
                    : updateData((d:any)=> ({ ...d, author: a.name, authorId: a.id, authorTOV: a.tov }), 'author')
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40 chip-glow chip-glow-active' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step==='section' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg section</div>
          <div className="flex flex-wrap gap-[14px]">
            {sections.map(s=> {
              const selected = data.section === s;
              return (
                <button
                  key={s}
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, section: '', topic: '' }))
                    : updateData((d:any)=> ({ ...d, section: s, topic: '' }), 'section')
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40 chip-glow chip-glow-active' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step==='topic' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg topic</div>
          <div className="flex flex-wrap gap-[14px]">
            {topics.map(t=> {
              const selected = data.topic === t;
              return (
                <button
                  key={t}
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, topic: '' }))
                    : updateData((d:any)=> ({ ...d, topic: t }), 'topic')
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40 chip-glow chip-glow-active' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step==='press' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Presseakkreditering?</div>
          <label className="flex items-center gap-2 text-white/80 text-sm">
            <input type="checkbox" checked={!!data.press} onChange={(e)=> { updateData((d:any)=>({ ...d, press: e.target.checked })); if (e.target.checked!==undefined) nextStep('press'); }} className="w-4 h-4" />
            Ja, der er pressekontakt/akkreditering
          </label>
        </div>
      )}

      {step==='rating' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Rating (ved anmeldelser)</div>
          <div className="flex gap-[14px]">
            {[1,2,3,4,5,6].map(r=> (
              <button
                key={r}
                onClick={()=> updateData((d:any)=> ({ ...d, rating: (d.rating===r ? 0 : r) }), 'rating')}
                className={`px-3 py-1.5 rounded-lg border text-xs ${data.rating===r ? 'bg-white/10 text-white border-white/40 chip-glow chip-glow-active' : 'bg-white/5 text-white border-white/20 hover:border-white/40 hover:bg-white/10'}`}
              >{r} ⭐</button>
            ))}
          </div>
        </div>
      )}

      {step==='review' && (
        <div className="space-y-[14px]">
          <div className="text-white text-sm">Review</div>
          <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-white/80 text-sm">
            <div>Author: <span className="text-white">{data.author}</span></div>
            <div>Section: <span className="text-white">{data.section}</span></div>
            <div>Topic: <span className="text-white">{data.topic}</span></div>
            <div>Press: <span className="text-white">{data.press ? 'Ja' : 'Nej'}</span></div>
            {data.topic==='Anmeldelser' && (<div>Rating: <span className="text-white">{data.rating} ⭐</span></div>)}
          </div>
        </div>
      )}

      {/* Actions removed - auto-advance; Start chat happens outside after review or via parent */}
    </div>
  );
}


