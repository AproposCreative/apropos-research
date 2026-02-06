#!/usr/bin/env node
/**
 * Cleanup script to remove articles older than 7 days from JSONL files
 * Run: npx tsx scripts/cleanup-old-articles.ts
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ARTICLES_FILE = path.resolve(process.cwd(), 'data', 'rage_articles.jsonl');
const PROMPTS_FILE = path.resolve(process.cwd(), 'prompts', 'rage_prompts.jsonl');

const DAYS_TO_KEEP = 7;
const CUTOFF_TIME = Date.now() - (DAYS_TO_KEEP * 24 * 60 * 60 * 1000);

async function cleanupFile(filePath: string, fileType: 'articles' | 'prompts'): Promise<{ kept: number; removed: number }> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) {
      console.log(`📄 ${fileType}: File is empty, skipping`);
      return { kept: 0, removed: 0 };
    }

    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const kept: string[] = [];
    let removed = 0;

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        
        // Get date from record
        const dateStr = record.published_at || record.date || record.fetched_at || record.created_at;
        if (!dateStr) {
          // Keep records without dates (might be recent but missing date)
          kept.push(line);
          continue;
        }

        const recordDate = Date.parse(dateStr);
        if (isNaN(recordDate) || recordDate === 0) {
          // Invalid date - keep it
          kept.push(line);
          continue;
        }

        // Check if article is older than cutoff
        if (recordDate < CUTOFF_TIME) {
          removed++;
        } else {
          kept.push(line);
        }
      } catch (parseErr) {
        // Skip invalid JSON lines
        console.warn(`⚠️ Skipping invalid JSON line in ${fileType}:`, parseErr);
      }
    }

    // Write back only kept records
    if (kept.length > 0) {
      await fs.writeFile(filePath, kept.join('\n') + '\n', 'utf8');
    } else {
      // Empty file if no records kept
      await fs.writeFile(filePath, '', 'utf8');
    }

    console.log(`✅ ${fileType}: Kept ${kept.length}, removed ${removed} old records`);
    return { kept: kept.length, removed };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.log(`📄 ${fileType}: File does not exist, skipping`);
      return { kept: 0, removed: 0 };
    }
    console.error(`❌ Error cleaning up ${fileType}:`, err);
    throw err;
  }
}

async function main() {
  console.log(`🧹 Cleaning up articles older than ${DAYS_TO_KEEP} days...`);
  console.log(`📅 Cutoff date: ${new Date(CUTOFF_TIME).toISOString()}`);
  console.log('');

  const articlesResult = await cleanupFile(ARTICLES_FILE, 'articles');
  const promptsResult = await cleanupFile(PROMPTS_FILE, 'prompts');

  console.log('');
  console.log('📊 Summary:');
  console.log(`  Articles: ${articlesResult.kept} kept, ${articlesResult.removed} removed`);
  console.log(`  Prompts: ${promptsResult.kept} kept, ${promptsResult.removed} removed`);
  console.log(`  Total removed: ${articlesResult.removed + promptsResult.removed} old records`);
}

main().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
