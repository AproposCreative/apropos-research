import { sameSocialDraft, socialDraftSchema, type SocialDraftRecord, type SocialEditorDraft } from '@/lib/social/editor-draft';
export type DraftSyncState = { ready: boolean; loadVersion: number; draft: SocialEditorDraft | null;
  status: 'loading' | 'saved' | 'saving' | 'offline' | 'conflict'; error: string | null };
type Journal = { record: SocialDraftRecord; pending: SocialEditorDraft | null };
export type DraftTransport = { read: () => Promise<SocialDraftRecord>;
  write: (revision: number, draft: SocialEditorDraft, keepalive: boolean) => Promise<{ conflict: boolean; record: SocialDraftRecord }> };
/** Local journal is synchronous; the server uses optimistic revisions. No last-
 * writer-wins overwrite after an offline edit or a second device's changes. */
export class DraftSync {
  state: DraftSyncState = { ready: false, loadVersion: 0, draft: null, status: 'loading', error: null };
  private record: SocialDraftRecord = { revision: 0, draft: null, updatedAt: null };
  private pending: SocialEditorDraft | null = null;
  private remoteConflict: SocialDraftRecord | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private writing = false;
  private closed = false;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, private key: string,
    private transport: DraftTransport, private changed: (state: DraftSyncState) => void) {}
  private notify(patch: Partial<DraftSyncState>) {
    this.state = { ...this.state, ...patch };
    if (!this.closed) this.changed(this.state);
  }
  private journal() {
    try { this.storage.setItem(this.key, JSON.stringify({ record: this.record, pending: this.pending } satisfies Journal)); }
    catch { this.notify({ error: 'Denne enhed kan ikke gemme en lokal kopi. Hold siden åben, indtil der står Gemt.' }); }
  }
  async load() {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw) {
        const row = JSON.parse(raw) as Journal;
        if (Number.isSafeInteger(row.record?.revision) && row.record.revision >= 0 &&
          (!row.record.draft || socialDraftSchema.safeParse(row.record.draft).success) &&
          (!row.pending || socialDraftSchema.safeParse(row.pending).success)) {
          this.record = row.record; this.pending = row.pending;
        }
      }
    } catch { /* A corrupt local cache never replaces a server draft. */ }
    try {
      const remote = await this.transport.read();
      if (this.closed) return;
      if (this.pending && sameSocialDraft(remote.draft, this.pending)) this.pending = null;
      if (this.pending && remote.revision !== this.record.revision) this.remoteConflict = remote;
      else this.record = remote;
      this.journal();
      this.notify({ ready: true, loadVersion: this.state.loadVersion + 1, draft: this.pending ?? this.record.draft,
        status: this.remoteConflict ? 'conflict' : this.pending ? 'saving' : 'saved',
        error: this.remoteConflict ? 'En anden enhed har gemt en nyere version.' : null });
      if (this.pending && !this.remoteConflict) this.schedule();
    } catch {
      if (this.closed) return;
      this.notify({ ready: !!(this.pending || this.record.draft), loadVersion: this.state.loadVersion + 1,
        draft: this.pending ?? this.record.draft, status: 'offline', error: 'Ingen forbindelse. Ændringer bliver på denne enhed, indtil de er synkroniseret.' });
    }
  }
  edit(draft: SocialEditorDraft) {
    if (!this.state.ready || this.closed) return;
    if (sameSocialDraft(draft, this.pending ?? this.record.draft)) return;
    const parsed = socialDraftSchema.safeParse(draft);
    if (!parsed.success) { this.notify({ error: 'Teksten er for lang til at gemme. Forkort den før du lukker siden.' }); return; }
    this.pending = parsed.data; this.journal();
    if (!this.remoteConflict) { this.notify({ status: 'saving' }); this.schedule(); }
  }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush(); }, 600); }
  async flush(keepalive = false) {
    clearTimeout(this.timer);
    if (!this.pending || this.writing || this.remoteConflict || this.closed) return;
    this.writing = true; const sent = this.pending;
    try {
      const result = await this.transport.write(this.record.revision, sent, keepalive);
      if (result.conflict) {
        this.remoteConflict = result.record;
        this.notify({ status: 'conflict', error: 'En anden enhed har gemt en nyere version.' });
      } else {
        this.record = result.record;
        if (sameSocialDraft(this.pending, sent)) this.pending = null;
        this.journal();
        this.notify({ status: this.pending ? 'saving' : 'saved', error: null });
      }
    } catch { this.notify({ status: 'offline', error: 'Gemt på denne enhed. Serveren kunne ikke nås.' }); }
    finally { this.writing = false; if (this.pending && this.state.status === 'saving' && !this.closed) this.schedule(); }
  }
  keepLocal() {
    if (!this.remoteConflict) return;
    this.record = this.remoteConflict; this.remoteConflict = null; this.journal();
    this.notify({ status: 'saving', error: null }); this.schedule();
  }
  useServer() {
    if (!this.remoteConflict) return;
    this.record = this.remoteConflict; this.pending = null; this.remoteConflict = null; this.journal();
    this.notify({ status: 'saved', error: null, draft: this.record.draft, loadVersion: this.state.loadVersion + 1 });
  }
  close() { void this.flush(true); this.closed = true; clearTimeout(this.timer); }
}
