import ChatGPTConnection from './connection';
export const metadata = { title: 'ChatGPT · Apropos', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ searchParams }: { searchParams: Promise<{ request?: string; publication?: string; shortening?: string; submission?: string; review?: string; source?: string; id?: string; mail?: string }> }) {
  const { request, publication, shortening, submission, review, source, id, mail } = await searchParams;
  return <ChatGPTConnection requestId={request || ''} publicationId={publication || ''} shorteningId={shortening || ''} submissionId={submission || ''}
    review={review === '1'} reviewSource={source || ''} reviewId={id || ''} mailId={mail && /^[a-f0-9]{64}$/.test(mail) ? mail : ''} />;
}
