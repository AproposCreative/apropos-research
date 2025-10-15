'use client';
export default function StepChip({ active, done, label, onClick, stepKey }: { active: boolean; done: boolean; label: string; onClick: () => void; stepKey?: string }) {
  const baseClass = active
    ? 'text-white border-white/60 bg-white/10 shadow-[0_0_12px_rgba(255,255,255,0.18)]'
    : done
      ? 'text-white/80 border-white/30 hover:border-white/50 hover:bg-white/10'
      : 'text-white/60 border-white/20 hover:border-white/40 hover:bg-white/10';
  return (
    <button
      onClick={onClick}
      data-step={stepKey || label.toLowerCase()}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-200 ${baseClass}`}
    >
      <span className={active ? 'text-sheen-glow' : ''}>{label}</span>
    </button>
  );
}
