#!/usr/bin/env tsx
import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { getAdminDb } from '../lib/firebase-admin';
import { LivBudgetOpenAI } from '../lib/liv/cost-openai';
import { withSharedCostContext } from '../lib/liv/cost-context';
import { getLivCostPretransportError } from '../lib/liv/cost-errors';
import { buildEmbeddingArchive, EMBEDDING_MODEL, validEmbedding } from '../lib/incremental-embeddings';

config({ path: '.env.local', quiet: true });
async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY_missing');
  process.env.AI_SHARED_COST_ENABLED = 'true';
  const db = getAdminDb();
  if (!db) throw new Error('embedding_cache_unavailable');
  const cache = db.collection('editorialEmbeddingCache');
  const client = new LivBudgetOpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const articles = JSON.parse(await readFile('data/apropos-articles.json', 'utf8'));
  let generated = 0;
  const output = await buildEmbeddingArchive(articles, {
    read: async key => {
      const row = (await cache.doc(key).get()).data();
      return row?.status === 'responded' && validEmbedding(row.embedding) ? row.embedding : null;
    },
    generate: async (key, input) => {
      const ref = cache.doc(key), owner = randomUUID();
      const saved = await db.runTransaction(async tx => {
        const row = (await tx.get(ref)).data();
        if (row?.status === 'responded' && validEmbedding(row.embedding)) return row.embedding;
        if (row && row.status !== 'not_started') throw new Error('embedding_requires_reconciliation');
        tx.set(ref, { status: 'started', owner, model: EMBEDDING_MODEL, startedAt: new Date().toISOString() });
        return null;
      });
      if (saved) return saved;
      try {
        const response = await withSharedCostContext({ scope: 'writer', stage: 'archive_embeddings' },
          () => client.embeddings.create({ model: EMBEDDING_MODEL, input }));
        const embedding = response.data[0]?.embedding;
        if (!validEmbedding(embedding)) throw new Error('invalid_embedding_vector');
        await ref.update({ status: 'responded', embedding, respondedAt: new Date().toISOString() });
        generated++;
        return embedding;
      } catch (error) {
        const denial = getLivCostPretransportError(error);
        await ref.update({ status: denial ? 'not_started' : 'uncertain', error: denial?.code || 'generation_or_persistence_failed' });
        throw error;
      }
    },
  });
  const target = 'data/articles-embeddings.json', temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(output, null, 2));
  await rename(temporary, target);
  console.log(JSON.stringify({ articles: output.length, generated, reused: output.length - generated }));
}
main().catch(() => { console.error('Embedding update failed; previous published archive retained. Inspect cache/ledger before retry.'); process.exitCode = 1; });
