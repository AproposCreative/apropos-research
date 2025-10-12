export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(0,0,0)' }}>
      {children}
    </div>
  );
}
