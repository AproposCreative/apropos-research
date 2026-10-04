import ChatGPTConnection from './connection';
export const metadata = { title: 'ChatGPT · Apropos', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ searchParams }: { searchParams: Promise<{ request?: string; publication?: string; shortening?: string }> }) {
  const { request, publication, shortening } = await searchParams;
  return <ChatGPTConnection requestId={request || ''} publicationId={publication || ''} shorteningId={shortening || ''} />;
}
