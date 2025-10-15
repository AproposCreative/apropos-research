'use client';
export default function StepChip({ active, done, label, onClick, stepKey }: { active: boolean; done: boolean; label: string; onClick: () => void; stepKey?: string }) {
  return (
    <button
      onClick={onClick}
      data-step={stepKey || label.toLowerCase()}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'text-white border-white/60 bg-white/10' : 'text-white/70 border-white/20 hover:border-white/40'}`}
    >
      <span className={active ? 'text-sheen-glow' : ''}>{label}</span>
    </button>
  );
}

