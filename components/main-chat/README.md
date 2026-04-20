# `components/main-chat/`

Sub-modules ekstraheret fra `app/ai/MainChatPanel.tsx` (~1900 linjer).

## I dag

- `constants.ts` — `THINKING_TEXTS` (humor-flavor til AI-tænke-overlay).
- `types.ts` — `ChatMessage`, `LocalArticleData`. Importeres af både panel
  og fremtidige sub-komponenter uden at trække hele panelet ind.

## Anbefalede næste skridt (skal laves med UI-test)

`MainChatPanel.tsx` er stadig stor fordi den indeholder ~30 useState hooks
og dyb JSX. For at undgå regressioner anbefales en **inkrementel** split:

1. **`ThinkingOverlay.tsx`** — `isThinking`, `thinkingText`, `thinkingProgress`
   + relateret JSX. ~150 linjer.
2. **`MessageList.tsx`** — `messages.map`, scroll-logik, edit/delete-actions.
   ~400 linjer.
3. **`InputBar.tsx`** — `inputMessage`, file-drop, send-knap. ~300 linjer.
4. **`ChatHeader.tsx`** — chat-title editor, top-knapper. ~200 linjer.
5. **`useChatScroll.ts`** — scroll-hook der reagerer på `messages` og
   `isThinking`.

Hver split skal følges af manuel test af: send/modtag, redigér besked,
slet besked, file-upload, retry-failed, og prompt-architect-knap.
