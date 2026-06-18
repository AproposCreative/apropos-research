/**
 * Kalder eksisterende iOS Firebase Function sendPodcastNotification (FCM topic new_podcasts).
 * Auth: header X-Apropos-Podcast-Secret (matcher Firebase secret PODCAST_NOTIFY_SECRET).
 */
export async function sendPodcastEpisodeNotification(input: {
  articleSlug: string;
  title: string;
}): Promise<{ skipped?: boolean; ignored?: boolean }> {
  const url = process.env.PODCAST_NOTIFY_URL?.trim();
  if (!url) {
    console.warn('[podcast] PODCAST_NOTIFY_URL ikke sat — springer notifikation over');
    return { skipped: true };
  }

  const secret = process.env.PODCAST_NOTIFY_SECRET?.trim();
  if (!secret) {
    throw new Error('PODCAST_NOTIFY_SECRET mangler — kan ikke sende push-notifikation');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Apropos-Podcast-Secret': secret,
    },
    body: JSON.stringify({
      articleSlug: input.articleSlug,
      title: input.title,
    }),
  });

  const text = await res.text().catch(() => '');
  let json: { status?: string; message?: string } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throw new Error(
      `sendPodcastNotification fejlede (${res.status}): ${json.message || text.slice(0, 200)}`
    );
  }

  if (json.status === 'ignored') {
    return { ignored: true };
  }

  return {};
}
