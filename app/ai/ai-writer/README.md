# `app/ai/ai-writer/`

Sub-modules ekstraheret fra `app/ai/AIWriterClient.tsx` (~1640 linjer).

## I dag

- `article-defaults.ts` — `buildDefaultArticleData`, `normalizeArticleData`,
  `BASE_THINKING_STEPS`, `GENERATION_MODE_OPTIONS`,
  `resolveViewFromSearchParams`. Pure helpers / data uden React-afhængigheder.

## Anbefalede næste skridt (skal laves med UI-test)

`AIWriterClient.tsx` er stadig stor (~1574 linjer) fordi den orkestrerer:

1. Draft-state (autosave, hentning fra Firestore).
2. Thinking-pipeline (8 steps, animeret).
3. Mange paneler: chat, wizard, review, drafts-shelf, web-apps,
   sources, settings, prompt-architect, design-editor, newsletter.
4. View-routing (`?view=...`).

Foreslåede splits:

1. **`useArticleDraft.ts`** — `currentDraftId`, `articleData`,
   `updateArticleData`, autosave-logik. ~250 linjer.
2. **`useThinkingPipeline.ts`** — `thinkingSteps`, animation, kald til
   `/api/ai-chat`. ~200 linjer.
3. **`useViewRouter.ts`** — `activeView`, `applyActiveView`, URL-sync.
   ~80 linjer.
4. **`PanelOrchestrator.tsx`** — JSX der mounter ReviewPanel, DraftsShelf,
   etc. ~300 linjer.

Hver split skal verificeres med: opret artikel → wizard → thinking → review
→ publish → autosave-recovery på refresh.
