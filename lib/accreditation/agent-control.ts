import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import type { AgentControlState } from '@/lib/accreditation/types';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';
import { isAccreditationTestRedirectActive } from '@/lib/accreditation/outbound-safety';

const FILENAME = 'accreditation_agent_control.json';
const DOC_ID = 'default';

const DEFAULT: AgentControlState = {
  automationEnabled: false,
  paused: true,
  dryRun: true,
  updatedAt: new Date(0).toISOString(),
};

let memoryState: AgentControlState | null = null;

function migrate(raw: Partial<AgentControlState>): AgentControlState {
  return {
    ...DEFAULT,
    ...raw,
    // Fail-closed: unset automation stays OFF (legacy paused=true → off).
    automationEnabled:
      typeof raw.automationEnabled === 'boolean'
        ? raw.automationEnabled
        : raw.paused === false
          ? true
          : false,
  };
}

function applyPatch(
  prev: AgentControlState,
  patch: Partial<AgentControlState>
): AgentControlState {
  const next: AgentControlState = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (patch.automationEnabled === false) {
    next.paused = true;
    next.pausedAt = next.pausedAt || new Date().toISOString();
  }
  if (patch.automationEnabled === true) {
    next.paused = false;
    next.pausedAt = undefined;
    next.pauseReason = undefined;
  }
  if (patch.paused === true && patch.automationEnabled === undefined) {
    next.automationEnabled = false;
    next.pausedAt = next.pausedAt || new Date().toISOString();
  }
  if (patch.paused === false && patch.automationEnabled === undefined) {
    next.automationEnabled = true;
    next.pausedAt = undefined;
    next.pauseReason = undefined;
  }
  return next;
}

export async function getAgentControl(): Promise<AgentControlState> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    return memoryState ? { ...memoryState } : { ...DEFAULT };
  }
  if (kind === 'json') {
    return migrate(readJsonFile<Partial<AgentControlState>>(FILENAME, {}));
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.agentControl).doc(DOC_ID).get();
  if (!snap.exists) return { ...DEFAULT };
  return migrate(snap.data() as Partial<AgentControlState>);
}

/** Atomic toggle — Firestore transaction prevents lost updates across Vercel instances. */
export async function setAgentControl(
  patch: Partial<AgentControlState>
): Promise<AgentControlState> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    const prev = memoryState ? { ...memoryState } : { ...DEFAULT };
    memoryState = applyPatch(prev, patch);
    return { ...memoryState };
  }
  if (kind === 'json') {
    const prev = migrate(readJsonFile<Partial<AgentControlState>>(FILENAME, {}));
    const next = applyPatch(prev, patch);
    writeJsonFile(FILENAME, next);
    return next;
  }

  const db = requireFirestore();
  const ref = db.collection(COLLECTIONS.agentControl).doc(DOC_ID);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = migrate((snap.data() || {}) as Partial<AgentControlState>);
    const next = applyPatch(prev, patch);
    tx.set(ref, stripUndefined({ ...next }), { merge: true });
    return next;
  });
}

/**
 * Auto outbound/reply is OFF unless BOTH:
 * 1) ACCREDITATION_AUTOMATION_ENABLED=true (env kill switch), and
 * 2) agent control toggle automationEnabled === true
 * Defaults stay fail-closed until Liv is tested end-to-end.
 */
export async function isAutomationEnabled(): Promise<boolean> {
  if (process.env.ACCREDITATION_AUTOMATION_ENABLED !== 'true') return false;
  return (await getAgentControl()).automationEnabled === true;
}

/** @deprecated prefer isAutomationEnabled */
export async function isAgentPaused(): Promise<boolean> {
  return !(await isAutomationEnabled());
}

export async function isDryRun(): Promise<boolean> {
  // Explicit env dry-run always wins.
  if (process.env.ACCREDITATION_DRY_RUN === 'true') return true;
  // Test redirect sink: allow real SMTP to the sink so Frederik can read Liv's mail.
  // Still blocked from anyone else by outbound-safety allowlist.
  if (isAccreditationTestRedirectActive()) {
    return false;
  }
  return (await getAgentControl()).dryRun === true;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryState = null;
  },
});
