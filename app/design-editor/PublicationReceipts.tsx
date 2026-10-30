'use client';
import type { ChannelReceipt, SocialPublishReceipt } from '@/lib/social/publish-types';
import styles from './SocialEditor.module.css';
function channelStatus(item: ChannelReceipt) {
  if (item.status === 'published') return 'Udgivet';
  if (item.status === 'skipped') return 'Ikke sendt';
  if (item.status === 'failed') return 'Stoppet';
  if (item.status === 'uncertain' || item.status === 'sending') return 'Afventer bekræftelse';
  return 'Afventer';
}
function Receipt({ receipt, check }: { receipt: SocialPublishReceipt; check: (requestId: string) => Promise<void> }) {
  return <section className={styles.receipt} aria-label="Udgivelseskvittering">
    <time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
    {(['instagram', 'facebook'] as const).filter(channel => receipt.channels[channel]).map(channel => <div key={channel}>
      <span>{channel === 'instagram' ? 'Instagram' : 'Facebook'}</span>
      {receipt[channel].url ? <a href={receipt[channel].url} target="_blank" rel="noopener noreferrer">Se opslag</a> : <span>{channelStatus(receipt[channel])}</span>}
    </div>)}
    {(['instagram', 'facebook', 'comment'] as const).map(channel => receipt[channel].error ? <p key={channel}>{receipt[channel].error}</p> : null)}
    {receipt.channels.facebook && receipt.comment.status !== 'published' && receipt.facebook.status === 'published' && <p>Artikellink som kommentar er ikke bekræftet. Selve Facebook-opslaget er udgivet.</p>}
    {receipt.phase === 'stopped' && <p>Forløbet blev stoppet. Et uklart svar bliver ikke sendt igen.</p>}
    <button type="button" className={styles.textButton} onClick={() => { void check(receipt.requestId); }}>Kontrollér status</button>
  </section>;
}
export default function PublicationReceipts({ receipts, check }: { receipts: SocialPublishReceipt[]; check: (requestId: string) => Promise<void> }) {
  if (!receipts.length) return null;
  return <div className={styles.receipts}>
    <p className={styles.captionLabel}>Seneste udgivelse</p>
    <Receipt receipt={receipts[0]} check={check} />
    {receipts.length > 1 && <details><summary>Tidligere udgivelser ({receipts.length - 1})</summary>
      {receipts.slice(1).map(receipt => <Receipt key={receipt.id} receipt={receipt} check={check} />)}
    </details>}
  </div>;
}
