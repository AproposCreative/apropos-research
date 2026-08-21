import { incomingAudioPath, getPodcastBucket } from '@/lib/podcast/bucket';
import { encodeToAac96k } from '@/lib/podcast/encode-aac';
import {
  setJobDone,
  setJobError,
  setJobProcessing,
} from '@/lib/podcast/job-store';
import { upsertManifestEpisode, uploadEncodedAudio } from '@/lib/podcast/manifest';
import { markWebflowAudioVersion } from '@/lib/podcast/mark-webflow-audio-version';
import { sendPodcastEpisodeNotification } from '@/lib/podcast/notify-episode';
import { probeAudioDurationSeconds } from '@/lib/podcast/probe-duration';
import { resolveArticleBySlug } from '@/lib/podcast/resolve-article';
import type { PodcastJobStep } from '@/lib/podcast/types';

export async function runPodcastPipeline(input: {
  jobId: string;
  slug: string;
  articleUrl: string;
}): Promise<void> {
  const { jobId, slug, articleUrl } = input;
  let currentStep: PodcastJobStep = 'metadata';

  try {
    currentStep = 'metadata';
    await setJobProcessing(jobId, 'metadata');
    const article = await resolveArticleBySlug(slug);
    if (!article) {
      throw new Error('Artikel ikke fundet på aproposmagazine.dk');
    }

    const bucket = getPodcastBucket();
    const incoming = bucket.file(incomingAudioPath(slug));
    const [exists] = await incoming.exists();
    if (!exists) {
      throw new Error('Lydfil mangler i incoming — upload den først');
    }

    currentStep = 'encode';
    await setJobProcessing(jobId, 'encode');
    const [raw] = await incoming.download();
    const encoded = await encodeToAac96k(Buffer.from(raw));
    const audioUrl = await uploadEncodedAudio(slug, encoded);
    const durationSeconds = await probeAudioDurationSeconds(encoded);

    currentStep = 'manifest';
    await setJobProcessing(jobId, 'manifest');
    await upsertManifestEpisode({
      slug,
      title: article.title,
      articleUrl: articleUrl || article.articleUrl,
      audioUrl,
      hosts: article.authorName ? [article.authorName] : undefined,
      durationSeconds: durationSeconds ?? undefined,
      audioBytes: encoded.byteLength,
      description: article.description ?? undefined,
      imageURL: article.coverUrl ?? undefined,
      kind: 'human',
    });

    currentStep = 'notification';
    await setJobProcessing(jobId, 'notification');
    await sendPodcastEpisodeNotification({ articleSlug: slug, title: article.title });

    // Best-effort: markér Webflow CMS "Lydversion" — må ikke fejle hele jobbet
    try {
      const marked = await markWebflowAudioVersion(slug);
      if (!marked.ok) {
        console.warn('[podcast] lydversion ikke sat', slug, marked.skipped);
      }
    } catch (err) {
      console.warn('[podcast] lydversion sync failed', slug, err);
    }

    currentStep = 'cleanup';
    await setJobProcessing(jobId, 'cleanup');
    await incoming.delete({ ignoreNotFound: true });

    await setJobDone(jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ukendt fejl';
    await setJobError(jobId, currentStep, msg);
    throw err;
  }
}
