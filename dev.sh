#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROMPTS="$ROOT/prompts/rage_prompts.jsonl"

echo "▶️  Ragekniv starter…"

# 1) Sørg for prompts-data
if [ ! -s "$PROMPTS" ]; then
  echo "ℹ️  Ingen/empty prompts-fil fundet – kører ingest nu (48t / 60 stk)…"
  cd "$ROOT"
  npm run ingest:rage -- --since=48 --limit=60
else
  echo "✅ Prompts-fil fundet: $PROMPTS"
fi

# 2) Start Next.js app (installer deps automatisk første gang)
cd "$ROOT"
if [ ! -d node_modules ]; then
  echo "📦 Installerer dependencies…"
  npm i
fi

echo "🌐 Starter Next.js app på http://localhost:${PORT:-3000}"
RAGE_PROMPTS_PATH="./prompts/rage_prompts.jsonl" PORT="${PORT:-3000}" npm run dev
