import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { getOpenAIClient } from '@/lib/openai';
import { appendAiAudit } from '@/lib/accreditation/audit-store';
import { getAgentControl, isAutomationEnabled } from '@/lib/accreditation/agent-control';
import { newEntityId } from '@/lib/accreditation/ids';
import { composeLivSystemPrompt } from '@/lib/accreditation/liv-system-prompt';
import { loadMemoryForReply } from '@/lib/accreditation/memory-store';
import { resolveAccreditationModelForTask } from '@/lib/accreditation/models';
import { readRequests } from '@/lib/accreditation/request-store';
import { sanitizeLivOutput } from '@/lib/accreditation/sanitize';
import type { LivChatMessage, LivChatThread } from '@/lib/accreditation/types';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const FILENAME = 'accreditation_liv_chat.json';
const MAX_THREADS = 40;

const memoryChats = new Map<string, LivChatThread>();

async function loadAll(): Promise<LivChatThread[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return [...memoryChats.values()];
  if (kind === 'json') return readJsonFile<LivChatThread[]>(FILENAME, []);
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.livChat).get();
  return snap.docs.map((d) => d.data() as LivChatThread);
}

async function saveOne(thread: LivChatThread): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryChats.set(thread.id, thread);
    return;
  }
  if (kind === 'json') {
    const all = readJsonFile<LivChatThread[]>(FILENAME, []);
    const idx = all.findIndex((t) => t.id === thread.id);
    if (idx >= 0) all[idx] = thread;
    else all.unshift(thread);
    writeJsonFile(FILENAME, all.slice(0, MAX_THREADS));
    return;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.livChat)
    .doc(thread.id)
    .set(stripUndefined({ ...thread } as Record<string, unknown>), { merge: true });
}

export async function readChatThreads(): Promise<LivChatThread[]> {
  return loadAll();
}

export async function writeChatThreads(threads: LivChatThread[]): Promise<void> {
  const limited = threads.slice(0, MAX_THREADS);
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryChats.clear();
    for (const t of limited) memoryChats.set(t.id, t);
    return;
  }
  if (kind === 'json') {
    writeJsonFile(FILENAME, limited);
    return;
  }
  const db = requireFirestore();
  const batch = db.batch();
  for (const t of limited) {
    batch.set(
      db.collection(COLLECTIONS.livChat).doc(t.id),
      stripUndefined({ ...t } as Record<string, unknown>),
      { merge: true }
    );
  }
  await batch.commit();
}

export async function getOrCreateChatThread(threadId?: string): Promise<LivChatThread> {
  if (threadId) {
    const kind = resolveAccreditationPersistenceKind();
    if (kind === 'memory') {
      const found = memoryChats.get(threadId);
      if (found) return found;
    } else if (kind === 'json') {
      const found = readJsonFile<LivChatThread[]>(FILENAME, []).find((t) => t.id === threadId);
      if (found) return found;
    } else {
      const db = requireFirestore();
      const snap = await db.collection(COLLECTIONS.livChat).doc(threadId).get();
      if (snap.exists) return snap.data() as LivChatThread;
    }
  }

  const now = new Date().toISOString();
  const thread: LivChatThread = {
    id: newEntityId('chat'),
    title: 'Ny snak med Liv',
    messages: [],
    linkedRequestIds: [],
    createdAt: now,
    updatedAt: now,
  };

  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    const all = [thread, ...memoryChats.values()].slice(0, MAX_THREADS);
    memoryChats.clear();
    for (const t of all) memoryChats.set(t.id, t);
    return thread;
  }
  if (kind === 'json') {
    const all = readJsonFile<LivChatThread[]>(FILENAME, []);
    all.unshift(thread);
    writeJsonFile(FILENAME, all.slice(0, MAX_THREADS));
    return thread;
  }

  await saveOne(thread);
  return thread;
}

async function linkedRequestContext(thread: LivChatThread) {
  const id = thread.linkedRequestIds[0];
  const requests = await readRequests();
  if (!id) {
    const recent = requests.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return recent || null;
  }
  return requests.find((r) => r.id === id) || null;
}

export async function replyAsLiv(params: {
  threadId?: string;
  userMessage: string;
}): Promise<{ thread: LivChatThread; reply: LivChatMessage }> {
  const thread = await getOrCreateChatThread(params.threadId);
  const userMsg: LivChatMessage = {
    id: newEntityId('msg'),
    role: 'user',
    content: params.userMessage.trim(),
    createdAt: new Date().toISOString(),
  };
  thread.messages.push(userMsg);

  const openai = getOpenAIClient();
  let content =
    'Jeg er her - smid event-URL, antal og recipient-mail, så tager jeg den videre. Eller fortæl kort, hvad du mangler.';

  const control = await getAgentControl();
  const automationEnabled = await isAutomationEnabled();
  const request = await linkedRequestContext(thread);
  const memory = await loadMemoryForReply({
    requestId: request?.id,
    contactEmail: request?.contactEmail || request?.deliveryRecipientEmail,
  });
  const composed = composeLivSystemPrompt({
    task: 'studio_chat',
    automationEnabled,
    request,
    threadMessages: thread.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    taskInstructions: [
      'Du chatter med en redaktørkollega i studio.',
      'Hjælp med at starte sager, forklare status, og foreslå næste skridt.',
      'Roller må aldrig blandes sammen: Liv Brandt er afsenderen, pressepersonen eller arrangøren modtager ansøgningen, og skribenten eller billetmodtageren er den person, akkrediteringen søges til.',
      `Automation lige nu: ${control.automationEnabled !== false ? 'ON' : 'OFF'}.`,
      'Ingen robot-statuslister.',
      'Brug aldrig em dash (—) eller en dash (–); brug ASCII -.',
      memory ? `\nPersistent hukommelse (ingen fulde mailbodies):\n${memory}` : '',
    ]
      .filter(Boolean)
      .join(' '),
  });
  const model = resolveAccreditationModelForTask('studio_chat');

  if (openai) {
    try {
      const history = thread.messages.slice(-16).map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.55,
        messages: [
          { role: 'system', content: composed.prompt },
          ...history.filter((m) => m.role !== 'system'),
        ],
      });
      content = completion.choices[0]?.message?.content?.trim() || content;
      await appendAiAudit({
        requestId: request?.id,
        type: 'ai_studio_chat',
        detail: `Liv studio chat (${model})`,
        model,
        promptVersion: composed.promptVersion,
        task: composed.task,
        lane: composed.lane,
      });
    } catch {
      /* keep fallback */
    }
  }

  content = sanitizeLivOutput(content);

  const reply: LivChatMessage = {
    id: newEntityId('msg'),
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
    requestIds: thread.linkedRequestIds,
  };
  thread.messages.push(reply);
  if (thread.messages.length === 2) {
    thread.title = params.userMessage.trim().slice(0, 48) || thread.title;
  }
  thread.updatedAt = new Date().toISOString();

  const all = await readChatThreads();
  const idx = all.findIndex((t) => t.id === thread.id);
  if (idx >= 0) all[idx] = thread;
  else all.unshift(thread);
  await writeChatThreads(all.slice(0, MAX_THREADS));

  return { thread, reply };
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryChats.clear();
  },
});
