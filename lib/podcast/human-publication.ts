// LOCAL COOPERATION PROPOSAL. Uses only the Research application's existing clients.
import { getAdminDb } from '@/lib/firebase-admin';
import { getPodcastBucket } from './bucket';
import { env } from '@/lib/config/env';
import { encodeToAac96k } from './encode-aac';
import { probeAudioDurationSeconds } from './probe-duration';
import { podcastShowCoverUrl } from './show-config';
import core from './human-publication-core.cjs';

export function createResearchHumanPublisher({ db, bucket, encode, probe, onStep, transport = fetch }: {
  db: any; bucket: any; encode: (bytes: Buffer) => Promise<Buffer>;
  probe: (bytes: Buffer) => Promise<number | null>; onStep?: (step: string) => Promise<void>;
  transport?: typeof fetch;
}) {
  async function readPublicationActor() {
    // Read only the authenticated SDK client's email in memory. Do not enumerate,
    // copy, persist or log credentials, private keys, tokens or ambient accounts.
    const client = bucket?.storage?.authClient;
    if (typeof client?.getCredentials !== 'function') throw Error('Current Storage actor capability unavailable');
    const credentials = await client.getCredentials(), email = credentials?.client_email;
    if (email !== 'firebase-adminsdk-fbsvc@apropos-magazine-6004a.iam.gserviceaccount.com') throw Error('Current Storage actor is not the qualified Research actor');
    return email;
  }
  async function readSource(slug: string) {
    const found = await db.collection('articles').where('fieldData.slug', '==', slug).limit(10001).get();
    if (found.docs.length > 10000) throw Error('Canonical article inventory exceeds bound');
    const rows = found.docs.filter((doc: any) => {
      const value = doc.data();
      return value.id === doc.id && /^[a-f\d]{24}$/.test(doc.id) && value.fieldData?.slug === slug &&
        value.isDraft === false && value.isArchived !== true && value.publicationState !== 'withdrawn' && value.contentLanguage !== 'en';
    });
    if (rows.length !== 1) throw Error('Unique published canonical article required');
    const mirror = rows[0].data();
    const collection = env.WEBFLOW_ARTICLES_COLLECTION_ID;
    const key = env.WEBFLOW_API_TOKEN;
    if (!/^[a-f\d]{24}$/.test(collection || '') || !key) throw Error('Current CMS reader unavailable');
    const response = await transport(`https://api.webflow.com/v2/collections/${collection}/items/${mirror.id}/live`, {
      headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error('Current live article could not be confirmed');
    const binding = core.qualifyLiveSource(mirror, await response.json(), slug), fd = mirror.fieldData;
    const text = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim() : '';
    let hosts = ['Apropos Magazine'];
    if (fd.author != null) {
      if (typeof fd.author !== 'string' || !/^[a-f\d]{24}$/.test(fd.author)) throw Error('Exact canonical author reference required');
      const author = await db.collection('authors').doc(fd.author).get();
      const name = author.exists ? author.data()?.fieldData?.name : null;
      if (typeof name === 'string' && name.trim()) hosts = [name.trim()];
    }
    const cover = ['thumb', 'cover', 'thumbnail', 'main-image', 'mainImage', 'image'].map(key => fd[key])
      .map(value => typeof value === 'string' ? value : value?.url).find(value => typeof value === 'string' && value.trim());
    const description = ['summary', 'excerpt', 'meta-description', 'intro', 'subtitle', 'content'].map(key => text(fd[key])).find(Boolean);
    return {...binding, editorialMetadata: {title: fd.name, hosts,
      ...(description ? {description: description.slice(0, 4000)} : {}), imageURL: cover || podcastShowCoverUrl()}};
  }
  return core.createHumanPublisher({ db, bucket, encode, probe, onStep, readSource, readPublicationActor });
}

export async function publishHumanRecording(input: {
  jobId: string; slug: string;
  onStep?: (step: string) => Promise<void>;
}) {
  const db = getAdminDb();
  if (!db) throw Error('Existing publication database unavailable');
  const publisher = createResearchHumanPublisher({ db, bucket: getPodcastBucket(), encode: encodeToAac96k,
    probe: probeAudioDurationSeconds, onStep: input.onStep });
  return publisher.publish(input);
}
