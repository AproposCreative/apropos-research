import { getAdminDb } from '@/lib/firebase-admin';
import { getCopenhagenIsoWeekKey } from '@/lib/newsletter/copenhagen-time';
import { MAX_NEWSLETTER_ARTICLES, type NewsletterArticle } from '@/lib/newsletter/webflow-sources';

/** Owner-selected feature for one send week, independent of CMS dates and send history. */
export async function getWeeklyNewsletterFeatureId(referenceDate: Date): Promise<string | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection('newsletterWeeklyFeatures').doc(getCopenhagenIsoWeekKey(referenceDate)).get();
  if (!snap.exists) return null;
  const id = snap.data()?.articleId;
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) {
    throw new Error('Ugens valgte feature har et ugyldigt artikel-id.');
  }
  return id;
}

export function promoteWeeklyNewsletterFeature(
  articles: NewsletterArticle[], feature: NewsletterArticle
): NewsletterArticle[] {
  return [feature, ...articles.filter((a) => a.id !== feature.id)].slice(0, MAX_NEWSLETTER_ARTICLES);
}
