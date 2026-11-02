'use client';
import { useState } from 'react';
import type { ChannelReceipt, SocialPublishReceipt } from '@/lib/social/publish-types';
import { facebookCommentNotice, socialReceiptChannelLabel } from '@/lib/social/receipt-feedback';
import styles from './SocialEditor.module.css';
function channelStatus(item: ChannelReceipt) {
  if (item.status === 'published') return 'Udgivet';
  if (item.status === 'skipped') return 'Ikke sendt';
  if (item.status === 'failed') return 'Stoppet';
  if (item.status === 'uncertain' || item.status === 'sending') return 'Afventer bekræftelse';
  return 'Afventer';
}
function Receipt({ receipt, check, canConnectStory }: { receipt: SocialPublishReceipt; check: (requestId: string) => Promise<void>; canConnectStory: boolean }) {
  const [checking, setChecking] = useState(false);
  const commentNotice = facebookCommentNotice(receipt);
  return <section className={styles.receipt} aria-label="Udgivelseskvittering">
    <time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
    {(['instagram', 'facebook'] as const).filter(channel => receipt.channels[channel]).map(channel => <div key={channel}>
      <span>{socialReceiptChannelLabel(receipt, channel)}</span>
      <span className={styles.receiptChannelResult}><span>{channelStatus(receipt[channel])}</span>
        {receipt[channel].url && <a href={receipt[channel].url} target="_blank" rel="noopener noreferrer">Se opslag</a>}</span>
    </div>)}
    {(['instagram', 'facebook', 'comment'] as const).map(channel => receipt[channel].error && !(channel === 'comment' && commentNotice) ? <p key={channel}>{receipt[channel].error}</p> : null)}
    {commentNotice && <p>{commentNotice.text}</p>}
    {receipt.approved.isStory && receipt.approved.storyLinkMode === 'none' && !receipt.storyLink && <p>Uden klikbart artikellink.</p>}
    {receipt.storyLink && <p>{receipt.storyLink.status === 'verified' ? 'Artikellink kontrolleret' : receipt.instagram.status === 'published' ? 'Story udgivet. Artikellinket er endnu ikke bekræftet.' : receipt.instagram.status === 'failed' ? 'Storyen med artikellink blev stoppet.' : receipt.instagram.status === 'uncertain' ? 'Story og artikellink kræver kontrol.' : 'Udgiver Story med artikellink…'}</p>}
    {canConnectStory && receipt.delivery === 'business-suite' && receipt.instagram.status === 'failed' && <a href="/social-story-connection" target="_blank" rel="noopener noreferrer">Tilslut Story-forbindelse</a>}
    {receipt.phase === 'stopped' && !commentNotice && <p>Forløbet er stoppet. Der sendes ikke automatisk igen.</p>}
    <button type="button" className={styles.textButton} disabled={checking} onClick={async () => {
      setChecking(true); try { await check(receipt.requestId); } finally { setChecking(false); }
    }}>{checking ? 'Kontrollerer…' : 'Kontrollér status'}</button>
  </section>;
}
export default function PublicationReceipts({ receipts, check, canConnectStory = false }: { receipts: SocialPublishReceipt[]; check: (requestId: string) => Promise<void>; canConnectStory?: boolean }) {
  if (!receipts.length) return null;
  return <div className={styles.receipts}>
    <p className={styles.captionLabel}>Seneste udgivelsesforsøg</p>
    <Receipt receipt={receipts[0]} check={check} canConnectStory={canConnectStory} />
    {receipts.length > 1 && <details><summary>Tidligere forsøg ({receipts.length - 1})</summary>
      {receipts.slice(1).map(receipt => <Receipt key={receipt.id} receipt={receipt} check={check} canConnectStory={canConnectStory} />)}
    </details>}
  </div>;
}
