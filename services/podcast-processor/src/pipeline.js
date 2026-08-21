import { getBucket } from './firebase.js';
import { encodeToAac96k, probeDurationSeconds } from './ffmpeg.js';
import { upsertEpisode, uploadPublishedAudio } from './manifest.js';
import { markWebflowAudioVersion } from './mark-webflow-audio.js';
import { sendPodcastNotification } from './notify.js';
import { resolveArticle } from './resolve-article.js';
import { setJobDone, setJobError, setJobProcessing } from './jobs.js';

const INCOMING_PATH = (slug) => `podcasts/incoming/${slug}/audio.m4a`;

export async function runPipeline({ jobId, slug, articleUrl }) {
  let currentStep = 'metadata';
  try {
    currentStep = 'metadata';
    await setJobProcessing(jobId, 'metadata');
    const article = await resolveArticle(slug);
    if (!article) {
      throw new Error('Artikel ikke fundet på aproposmagazine.dk');
    }

    const bucket = getBucket();
    const incoming = bucket.file(INCOMING_PATH(slug));
    const [exists] = await incoming.exists();
    if (!exists) {
      throw new Error('Lydfil mangler i incoming — upload den først');
    }

    currentStep = 'encode';
    await setJobProcessing(jobId, 'encode');
    const [raw] = await incoming.download();
    const encoded = await encodeToAac96k(raw);
    const durationSeconds = await probeDurationSeconds(encoded);

    const audioUrl = await uploadPublishedAudio(slug, encoded);

    currentStep = 'manifest';
    await setJobProcessing(jobId, 'manifest');
    await upsertEpisode({
      slug,
      title: article.title,
      articleUrl: articleUrl || article.articleUrl,
      audioUrl,
      durationSeconds: durationSeconds ?? undefined,
      audioBytes: encoded.byteLength,
      description: article.description || undefined,
      imageURL: article.coverUrl || undefined,
      kind: 'human',
    });

    currentStep = 'notification';
    await setJobProcessing(jobId, 'notification');
    await sendPodcastNotification({ articleSlug: slug, title: article.title });

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
    return { ok: true, slug, audioUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ukendt fejl';
    await setJobError(jobId, currentStep, msg);
    throw err;
  }
}
