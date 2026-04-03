export default function AILayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[100dvh]"
      style={{ backgroundColor: '#000', color: '#fff' }}
    >
      <style>{`html, body { background-color: #000 !important; }`}</style>
      {children}
    </div>
  );
}
