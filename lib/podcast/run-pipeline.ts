import {
  setJobDone,
  setJobError,
  setJobProcessing,
} from '@/lib/podcast/job-store';
import { readPodcastManifest, writeFeedMirror } from '@/lib/podcast/manifest';
import { publishHumanRecording } from '@/lib/podcast/human-publication';
import { markWebflowAudioVersion } from '@/lib/podcast/mark-webflow-audio-version';
import { sendPodcastEpisodeNotification } from '@/lib/podcast/notify-episode';
import type { PodcastJobStep } from '@/lib/podcast/types';

export async function runPodcastPipeline(input: {
  jobId: string;
  slug: string;
  articleUrl: string;
}): Promise<void> {
  const { jobId, slug } = input;
  let currentStep: PodcastJobStep = 'metadata';

  try {
    currentStep = 'metadata';
    await setJobProcessing(jobId, 'metadata');
    const publication = await publishHumanRecording({ jobId, slug,
      onStep: async step => { currentStep = step as PodcastJobStep; await setJobProcessing(jobId, currentStep); } });
    // Ordinary new human publication keeps its existing best-effort RSS effect.
    // Independent RSS authority/CAS remains a separate unresolved delivery gate.
    await writeFeedMirror(await readPodcastManifest()).catch(err => console.warn('[podcast] feed mirror write failed', err));

    currentStep = 'notification';
    await setJobProcessing(jobId, 'notification');
    await sendPodcastEpisodeNotification({ articleSlug: slug, title: publication.episode.title });

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
    // Retain the incoming original and every previously published recording.

    await setJobDone(jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ukendt fejl';
    await setJobError(jobId, currentStep, msg);
    throw err;
  }
}
