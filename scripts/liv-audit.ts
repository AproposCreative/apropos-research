#!/usr/bin/env npx tsx
/**
 * Drift: vis Liv-plan (Firestore livDailyPlan) og Liv-historik (livDailyArticles).
 * Kræver samme Firebase Admin-env som API (fx .env.local).
 *
 * Kør: npx tsx scripts/liv-audit.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { getAdminDb } from '@/lib/firebase-admin';
import { LIV_DAILY_COLLECTION } from '@/lib/liv/daily-history-store';
import { LIV_DAILY_PLAN_COLLECTION } from '@/lib/liv/daily-plan-store';

config({ path: resolve('.env.local') });
config({ path: resolve('.env') });

async function main() {
  const db = getAdminDb();
  if (!db) {
    console.error('Firebase Admin ikke initialiseret — tjek FIREBASE_ADMIN_* / NEXT_PUBLIC_FIREBASE_PROJECT_ID.');
    process.exit(1);
  }

  const [planSnap, dailySnap] = await Promise.all([
    db.collection(LIV_DAILY_PLAN_COLLECTION).limit(80).get(),
    db.collection(LIV_DAILY_COLLECTION).limit(80).get(),
  ]);

  const plans = planSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const daily = dailySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  console.log(
    JSON.stringify(
      {
        firebaseProjectHint: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
        livDailyPlanCount: plans.length,
        livDailyArticlesCount: daily.length,
        /** Planlagte retninger — endnu ikke nødvendigvis genereret eller sendt til Webflow */
        pendingPlans: plans.filter((p: any) => p.status === 'pending'),
        /** Seneste daglige kørsler (alle statusser) — `published` har typisk webflowItemId */
        livDailyArticlesSample: daily.slice(0, 40),
      },
      (_k, v) => (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as any).toDate === 'function'
          ? (v as any).toDate().toISOString()
          : v),
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
