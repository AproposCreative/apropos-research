export default function ProductScreenshotCard() {
  return (
    <section className="research-container pb-16 md:pb-24">
      <div className="research-card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.08] flex items-center gap-2">
          <span className="size-2 rounded-full bg-white/20" />
          <span className="size-2 rounded-full bg-white/20" />
          <span className="size-2 rounded-full bg-white/20" />
          <span className="research-mono text-[10px] text-white/30 ml-2">studio.apropos</span>
        </div>
        <div
          className="aspect-[16/10] flex items-center justify-center"
          style={{ background: 'linear-gradient(180deg, #0c0c0c 0%, #080808 100%)' }}
        >
          <div className="text-center px-6">
            <p className="text-white/70 text-sm font-medium">AI Writer Studio</p>
            <p className="text-white/35 text-xs mt-2 max-w-sm mx-auto">
              Research → artikel → review → Webflow publish. Eksisterende workflow bevaret under Legacy Studio.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
