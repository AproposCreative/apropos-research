type Props = {
  index: string;
  title: string;
  description: string;
  bullets: string[];
};

export default function FeatureSplit({ index, title, description, bullets }: Props) {
  return (
    <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start py-12 border-t border-white/[0.08]">
      <div>
        <p className="research-mono text-xs text-white/30 mb-3">{index}</p>
        <h2 className="text-xl md:text-2xl font-medium tracking-tight text-white">{title}</h2>
        <p className="text-sm text-white/55 mt-3 leading-relaxed">{description}</p>
      </div>
      <ul className="space-y-3">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-3 text-sm text-white/70">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/40" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}
