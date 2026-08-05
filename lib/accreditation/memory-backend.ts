import type {
  ContactProfile,
  ConversationSummary,
  MemoryHealth,
  MemorySyncMeta,
  UpsertContactProfileInput,
} from '@/lib/accreditation/memory-types';

export type MemoryBackend = {
  getContactProfile(email: string): Promise<ContactProfile | undefined>;
  upsertContactProfile(input: UpsertContactProfileInput): Promise<ContactProfile>;
  listContactProfiles(): Promise<ContactProfile[]>;
  getConversationSummary(requestId: string): Promise<ConversationSummary | undefined>;
  upsertConversationSummary(input: {
    requestId: string;
    threadId?: string;
    summary: string;
    lastDirection?: 'inbound' | 'outbound';
  }): Promise<ConversationSummary>;
  getSyncMeta(): Promise<MemorySyncMeta | null>;
  setSyncMeta(meta: Omit<MemorySyncMeta, 'id'>): Promise<MemorySyncMeta>;
  health(): Promise<MemoryHealth>;
  /** Test helper: wipe in-memory / json stores. No-op on Firestore. */
  resetForTests?(): Promise<void>;
};
