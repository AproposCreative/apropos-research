import { internalApiHeaders } from '@/lib/api/internal-auth';
import { setJobError } from '@/lib/podcast/job-store';
import { runPodcastPipeline } from '@/lib/podcast/run-pipeline';

export type PodcastProcessorInput = {
  jobId: string;
  slug: string;
  articleUrl: string;
};

/** Kør pipeline inline (Vercel) — bruges når PODCAST_PROCESSOR_URL ikke er sat. */
export function startInlinePodcastPipeline(input: PodcastProcessorInput): void {
  void runPodcastPipeline(input).catch((err) => {
    console.error('[podcast] inline pipeline failed', input.jobId, err);
  });
}

/** Send job til Cloud Run hvis PODCAST_PROCESSOR_URL er konfigureret. */
export async function triggerCloudPodcastProcessor(input: PodcastProcessorInput): Promise<boolean> {
  const url = process.env.PODCAST_PROCESSOR_URL?.trim();
  if (!url) return false;

  const endpoint = `${url.replace(/\/$/, '')}/process`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: internalApiHeaders(),
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      await setJobError(input.jobId, 'queued', `Cloud Run fejlede (${res.status}): ${text.slice(0, 200)}`);
      return true;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Kunne ikke starte behandling';
    await setJobError(input.jobId, 'queued', msg);
    return true;
  }
}
