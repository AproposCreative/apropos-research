/**
 * Delte typer for MainChatPanel-økosystemet.
 *
 * Eksporteres separat så fremtidige sub-komponenter (chat-list, input-bar,
 * thinking-overlay m.fl.) kan importere dem uden at trække hele
 * `MainChatPanel.tsx` ind via `import type`.
 */

import type { UploadedFile } from '@/lib/file-upload-service';
import type { ArticleData } from '@/types/article';

export type LocalArticleData = ArticleData & {
  aiSuggestion?: { type: 'rating'; title: string; description: string } | null;
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  files?: UploadedFile[];
}
