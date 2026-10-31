import type { SocialPublishInput, SocialPublishReceipt, ChannelReceipt } from './publish-types';
import { MetaRequestError } from './meta-error';
export interface SocialPublisher {
  create(input: SocialPublishInput): Promise<string>;
  ready(containerId: string): Promise<void>;
  instagram(containerId: string): Promise<string>;
  facebook(input: SocialPublishInput): Promise<string>;
  comment(postId: string, articleUrl: string): Promise<string>;
  link(channel: 'instagram' | 'facebook', id: string): Promise<string | null>;
}
/** Only the transaction winner runs. Persist intent before every irreversible
 * call. A lost response or write never authorizes another publishing request. */
export async function runSocialPublish(receipt: SocialPublishReceipt, input: SocialPublishInput,
  publisher: SocialPublisher, save: (receipt: SocialPublishReceipt) => Promise<void>) {
  let active: 'instagram' | 'facebook' | 'comment' = 'instagram';
  let dispatching = false;
  const persist = async () => { receipt.updatedAt = new Date().toISOString(); await save(structuredClone(receipt)); };
  const send = async (channel: typeof active, operation: () => Promise<string>) => {
    active = channel; dispatching = false;
    receipt[channel] = { status: 'sending' }; receipt.phase = channel;
    await persist(); // If storage fails, do not send.
    dispatching = true;
    const id = await operation();
    if (!id) throw Error('Meta returnerede ingen opslag-ID.');
    receipt[channel] = { status: 'published', id, publishedAt: new Date().toISOString() };
    await persist(); // Failure after acceptance is uncertain; never republish.
    dispatching = false;
  };
  try {
    receipt.containerId = await publisher.create(input);
    await persist();
    await publisher.ready(receipt.containerId);
    await send('instagram', () => publisher.instagram(receipt.containerId!));
    if (receipt.channels.facebook) {
      await send('facebook', () => publisher.facebook(input));
      await send('comment', () => publisher.comment(receipt.facebook.id!, input.articleUrl));
    }
    receipt.complete = true; receipt.phase = 'done';
    await persist();
  } catch (cause) {
    // Raw provider exceptions may include secrets or URLs. Never store/log them.
    const prior = receipt[active];
    const definite = cause instanceof MetaRequestError && cause.definite;
    receipt[active] = { ...prior, status: dispatching ? definite ? 'failed' : 'uncertain' : prior.status === 'published' ? 'published' : 'failed',
      ...(cause instanceof MetaRequestError && cause.code !== undefined ? { errorCode: cause.code } : {}),
      error: cause instanceof MetaRequestError ? cause.message : dispatching ? 'Kvitteringen mangler. Der sendes ikke igen. Kontrollér status.' : 'Handlingen blev stoppet før afsendelse. Kontrollér status.' };
    receipt.complete = true; receipt.phase = 'stopped';
    for (const channel of ['facebook', 'comment'] as const) {
      if (receipt[channel].status === 'pending') receipt[channel] = { status: 'skipped', error: 'Ikke sendt, fordi et tidligere trin blev stoppet.' };
    }
    await persist().catch(() => { /* Persisted sending intent remains the safety lock. */ });
  }
  // Link readback cannot turn an accepted publication into a failed post.
  for (const channel of ['instagram', 'facebook'] as const) {
    const item: ChannelReceipt = receipt[channel];
    if (item.status === 'published' && item.id) {
      const url = await publisher.link(channel, item.id).catch(() => null);
      if (url) item.url = url;
    }
  }
  await persist().catch(() => {});
  return receipt;
}
