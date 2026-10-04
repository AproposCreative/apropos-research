import ChatGPTConnection from './connection';
export const metadata = { title: 'ChatGPT · Apropos', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ searchParams }: { searchParams: Promise<{ request?: string; publication?: string }> }) {
  const { request, publication } = await searchParams;
  return <ChatGPTConnection requestId={request || ''} publicationId={publication || ''} />;
}
