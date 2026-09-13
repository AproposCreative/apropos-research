import { workspaceSnapshotSchema, type WorkspacePayload, type WorkspaceSnapshot, type WorkspaceVersionSelector } from './writer-workspace';

type Phase = 'loading' | 'ready' | 'resume' | 'saving' | 'saved' | 'offline' | 'conflict' | 'invalid' | 'restoring' | 'restore-error';
export type WorkspaceSyncState = { phase: Phase; resume: WorkspaceSnapshot | null };
type Transport = { read: () => Promise<Response>; write: (body: string) => Promise<Response>; restore?: (body: string) => Promise<Response> };

/** One controller per authenticated account. Retains the exact uncertain write
 * for idempotent retry; never advances a revision based on an unverified response. */
export class WriterWorkspaceSync {
  state: WorkspaceSyncState = { phase: 'loading', resume: null };
  private active = true;
  private initialized = false;
  private busy = false;
  private revision = 0;
  private latest = '';
  private saved = '';
  private pending: { body: string; data: string } | null = null;
  private pendingRestore: { body: string; local: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private transport: Transport, private changed: (state: WorkspaceSyncState) => void) {}
  private emit(phase: Phase, resume = this.state.resume) {
    if (!this.active) return;
    this.state = { phase, resume }; this.changed(this.state);
  }
  dispose() { this.active = false; clearTimeout(this.timer); }
  async start() {
    if (!this.active || this.busy || this.initialized) return;
    this.busy = true; this.emit('loading');
    try {
      const response = await this.transport.read();
      if (!this.active) return;
      if (!response.ok) throw new Error('unavailable');
      const body = await response.json();
      const snapshot = body.workspace === null ? null : workspaceSnapshotSchema.parse(body.workspace);
      if (!this.active) return;
      this.revision = snapshot?.revision || 0;
      this.saved = snapshot ? JSON.stringify(snapshot.data) : '';
      this.initialized = true;
      this.emit(snapshot ? 'resume' : 'ready', snapshot);
    } catch { this.emit('offline'); }
    finally { this.busy = false; this.schedule(); }
  }
  setData(data: WorkspacePayload) {
    const next = JSON.stringify(data);
    if (next !== this.latest && this.state.phase === 'invalid') {
      this.pending = null; this.emit('ready');
    }
    this.latest = next; this.schedule();
  }
  acceptResume() { if (this.state.resume) { this.emit('ready', null); this.schedule(); } }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.active || !this.initialized || this.busy || this.state.resume ||
      ['offline', 'conflict', 'invalid', 'restoring', 'restore-error'].includes(this.state.phase) || !this.latest || this.latest === this.saved) return;
    const data: WorkspacePayload = JSON.parse(this.latest);
    if (!this.saved && !data.messages.length && !data.notes && !data.articleData.title && !data.articleData.content) return;
    this.timer = setTimeout(() => { void this.save(); }, 2000);
  }
  async retry() {
    if (!this.active || this.busy || this.state.phase !== 'offline') return;
    if (!this.initialized) return this.start();
    // Retry the same uncertain write first, even if more text has been typed.
    await this.save();
  }
  async restore(selection: WorkspaceVersionSelector): Promise<WorkspaceSnapshot> {
    if (!this.active || this.busy || !this.transport.restore) throw new Error('Vent på den aktuelle gemning og prøv igen.');
    clearTimeout(this.timer); this.busy = true; this.emit('restoring');
    try {
      if (this.pendingRestore && JSON.stringify(JSON.parse(this.pendingRestore.body).selection) !== JSON.stringify(selection)) {
        throw new Error('Den tidligere gendannelse er ikke bekræftet endnu. Vælg den samme version og prøv igen først.');
      }
      if (!this.pendingRestore) {
        const response = await this.transport.read();
        if (!response.ok || !this.active) throw new Error('Arbejdsrummet kunne ikke hentes.');
        const body = await response.json();
        if (!this.active) throw new Error('Kontoen er skiftet.');
        const current = body.workspace === null ? null : workspaceSnapshotSchema.parse(body.workspace);
        this.pendingRestore = { local: this.latest, body: JSON.stringify({ operationId: crypto.randomUUID(),
          revision: current?.revision || 0, selection, local: JSON.parse(this.latest) }) };
      }
      const pending = this.pendingRestore;
      const response = await this.transport.restore(pending.body);
      if (!this.active) throw new Error('Kontoen er skiftet.');
      if (!response.ok) {
        if ([400, 404, 409, 413].includes(response.status)) this.pendingRestore = null;
        throw new Error('Gendannelsen kunne ikke bekræftes. Prøv igen.');
      }
      const snapshot = workspaceSnapshotSchema.parse((await response.json()).workspace);
      if (!this.active) throw new Error('Kontoen er skiftet.');
      this.revision = snapshot.revision; this.saved = JSON.stringify(snapshot.data);
      this.pending = null; this.pendingRestore = null; this.initialized = true;
      if (this.latest !== pending.local) {
        this.emit('resume', snapshot);
        throw new Error('Serverkopien er gendannet. Dine nyere lokale ændringer er beholdt; vælg hvilken kopi du vil fortsætte med.');
      }
      this.latest = this.saved; this.emit('saved', null);
      return snapshot;
    } catch (error) {
      if (this.state.phase !== 'resume') this.emit('restore-error');
      throw error;
    } finally { this.busy = false; }
  }
  private async save() {
    if (!this.active || this.busy || this.state.resume) return;
    this.pending ||= { body: JSON.stringify({ revision: this.revision, data: JSON.parse(this.latest) }), data: this.latest };
    const pending = this.pending;
    this.busy = true; this.emit('saving');
    try {
      const response = await this.transport.write(pending.body);
      if (!this.active) return;
      if (!response.ok) {
        this.emit(response.status === 409 ? 'conflict' : [400, 413].includes(response.status) ? 'invalid' : 'offline');
        return;
      }
      const body = await response.json();
      if (!this.active) return;
      if (!Number.isSafeInteger(body.revision) || body.revision < this.revision) throw new Error('invalid_revision');
      this.revision = body.revision; this.saved = pending.data; this.pending = null;
      this.emit('saved');
    } catch { this.emit('offline'); }
    finally { this.busy = false; this.schedule(); }
  }
}
