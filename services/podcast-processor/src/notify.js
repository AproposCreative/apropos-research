/**
 * Kalder eksisterende iOS Firebase Function sendPodcastNotification.
 * Den sender til FCM topic `new_podcasts` internt.
 */
export async function sendPodcastNotification({ articleSlug, title }) {
  const url = process.env.PODCAST_NOTIFY_URL?.trim();
  if (!url) {
    console.warn('[podcast-processor] PODCAST_NOTIFY_URL ikke sat — springer notifikation over');
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
    body: JSON.stringify({ articleSlug, title }),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`sendPodcastNotification fejlede (${res.status}): ${text.slice(0, 200)}`);
  }

  return JSON.parse(text || '{}');
}
