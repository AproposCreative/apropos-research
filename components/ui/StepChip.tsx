'use client';
export default function StepChip({ active, done, label, onClick }: { active: boolean; done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'text-white border-white/60 bg-white/10' : 'text-white/70 border-white/20 hover:border-white/40'} ${done ? 'shadow-[0_0_12px_rgba(255,255,255,0.35)]' : ''}`}
    >
      <span className={active ? 'text-sheen-glow' : ''}>{label}</span>
    </button>
  );
}


