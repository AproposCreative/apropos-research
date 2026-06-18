import { FieldValue } from 'firebase-admin/firestore';
import { getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getAdminDb } from '@/lib/firebase-admin';
import { parseArticleSlug } from '@/lib/push/parse-slug';
import type { PushSendInput, PushSendResult } from '@/lib/push/types';

/**
 * Én FCM-topic per send — enheder kan være tilmeldt flere emner, så parallel
 * udsendelse giver duplikater (jf. sendPodcastNotification i iOS functions).
 */
function resolveTopic(input: PushSendInput): string {
  if (input.destination === 'podcast') {
    return 'new_podcasts';
  }
  if (input.destination === 'none') {
    return input.audience === 'new_articles' ? 'new_articles' : 'breaking_news';
  }
  return 'new_articles';
}

async function resolveArticleId(slug: string): Promise<string> {
  const db = getAdminDb();
  if (!db) return slug;

  const slugQuery = await db
    .collection('articles')
    .where('fieldData.slug', '==', slug)
    .limit(1)
    .get();
  if (!slugQuery.empty) {
    const doc = slugQuery.docs[0];
    const data = doc.data() || {};
    return String(data.id || doc.id || slug);
  }

  const directDoc = await db.collection('articles').doc(slug).get();
  if (directDoc.exists) {
    const data = directDoc.data() || {};
    return String(data.id || directDoc.id || slug);
  }

  return slug;
}

function buildNotificationData(
  input: PushSendInput,
  slug: string | null,
  articleId: string | null
): Record<string, string> {
  const title = input.title.trim();
  const data: Record<string, string> = {
    article_name: title,
  };

  if (input.destination === 'podcast') {
    data.type = 'new_podcast';
    data.click_action = 'OPEN_ARTICLE';
    if (slug) {
      data.article_slug = slug;
      data.article_id = articleId || slug;
      data.podcast_title = title;
    }
  } else if (input.destination === 'none') {
    data.type = 'breaking_news';
    data.click_action = 'OPEN_APP';
  } else {
    data.type = 'new_article';
    data.click_action = slug ? 'OPEN_ARTICLE' : 'OPEN_APP';
    if (slug) {
      data.article_slug = slug;
      data.article_id = articleId || slug;
    }
  }

  const imageUrl = input.imageUrl?.trim();
  if (imageUrl) {
    data.thumbnail_url = imageUrl;
    data.cover_url = imageUrl;
  }

  return data;
}

function buildFcmMessage(
  title: string,
  body: string,
  topic: string,
  data: Record<string, string>
) {
  return {
    notification: { title, body },
    data,
    topic,
    android: {
      priority: 'high' as const,
      notification: {
        sound: 'default',
        imageUrl: data.thumbnail_url,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          'mutable-content': data.thumbnail_url ? 1 : 0,
          alert: { title, body },
        },
        ...data,
      },
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      fcmOptions: data.thumbnail_url ? { imageUrl: data.thumbnail_url } : undefined,
    },
  };
}

export async function sendPushNotification(
  input: PushSendInput,
  meta?: { sentBy?: string }
): Promise<PushSendResult> {
  const title = input.title.trim();
  if (!title) throw new Error('Overskrift mangler');

  const body = (input.body || title).trim();
  const slug =
    input.destination === 'none' ? null : parseArticleSlug(input.articleSlug || '');

  if (input.destination !== 'none' && !slug) {
    throw new Error('Angiv artikel-slug eller gyldig aproposmagazine.com/articles/… URL');
  }

  const topic = resolveTopic(input);
  const articleId = slug ? await resolveArticleId(slug) : null;
  const data = buildNotificationData(input, slug, articleId);

  getAdminDb();
  if (!getApps().length) throw new Error('Firebase Admin er ikke konfigureret');

  const messaging = getMessaging();
  const messageId = await messaging.send(buildFcmMessage(title, body, topic, data));

  const result: PushSendResult = {
    messageId,
    topic,
    destination: input.destination,
    articleSlug: slug || undefined,
    articleId: articleId || undefined,
  };

  const db = getAdminDb();
  if (db) {
    await db.collection('pushNotifications').add({
      title,
      body,
      imageUrl: input.imageUrl || null,
      destination: input.destination,
      articleSlug: slug,
      articleId,
      topic,
      messageId,
      sentBy: meta?.sentBy || null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return result;
}
