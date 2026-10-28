import { describe, expect, it, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ getAll: vi.fn(), hold: vi.fn(), cost: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ getAll: m.getAll, collection: (name: string) => ({ doc: (id: string) => `${name}/${id}` }) }) }));
vi.mock('@/lib/ai/provider-hold', () => ({ readProviderHold: m.hold }));
vi.mock('@/lib/liv/cost-ledger', () => ({ readLivCostSummary: m.cost }));
import { projectDeliveryAlertContext as project, readDeliveryAlertContext, renderDeliveryAlert } from '@/lib/liv/delivery-alert-context';
import { emptyDeliveryState, type ReadyEntry } from '@/lib/liv/delivery-policy';
const day = '2026-10-04';
const now = new Date('2026-10-04T18:00:00Z');
const provider = { blocked: true, revision: 5, blockedAt: '2026-09-30T22:00:31.491Z', reason: 'quota_exhausted' };
const base = () => ({ day, now, state: emptyDeliveryState(), provider });
const entry = (overrides = {}): ReadyEntry => ({ itemId: 'a'.repeat(24), title: 'Den faktiske artikel', slug: 'den-faktiske-artikel', kind: 'scheduled',
  scheduledDay: day, expiresDay: day, state: 'ready', preparedAt: now.toISOString(), payloadHash: 'b'.repeat(64), ...overrides });
beforeEach(() => { vi.clearAllMocks(); m.hold.mockResolvedValue(provider); m.cost.mockResolvedValue(null); });

describe('October 28 policy-stop regression', () => {
  const delayed = () => ({ day: '2026-10-28', now: new Date('2026-10-28T09:15:21.155Z'),
    state: emptyDeliveryState(), provider: { ...provider, blocked: false, revision: 6 } });
  const oldTopic = 'I Royal Arena viste Saveus, at han er klar til at være Martin fra Ørum igen';
  const stopped = () => ({ status: 'failed', reason: 'liv_cost_manual_writer_only: Bearer private', topic: oldTopic,
    updatedAt: '2026-10-26T19:00:31.287Z' });
  it('names the intentional stop, keeps the old topic as history and never recommends paid retry', () => {
    const input = { ...delayed(), runs: [{ id: 'prepare-2026-10-28', row: stopped() }] };
    const before = structuredClone(input);
    const c = project(input), mail = renderDeliveryAlert('failure', c);
    expect(c.blockerCodes).toEqual(['paid_automation_disabled', 'editorial_rebrief_required']);
    expect(c.title).toBe('Vælg en anmeldelse eller kulturguide');
    expect(c.retainedTopic).toBe(oldTopic);
    expect(mail.subject).toContain('Liv er forsinket');
    expect(mail.subject).not.toContain('Saveus');
    expect(mail.text).toContain(`Historisk emnehint (ikke valgt artikel): ${oldTopic}`);
    expect(mail.text).toContain('efter ejerens valg');
    expect(mail.text).toContain('get_liv_production_context');
    expect(mail.text).toContain('først endeligt misset efter kl. 20');
    expect(mail.text).not.toMatch(/budget_limit|Bearer private|provider_quota_exhausted|POST \/api\/liv\/operations\/retry|KOPIÉR TIL EN NY/);
    expect(c.published).toBe(false); expect(c.itemId).toBeNull();
    expect(input).toEqual(before);
  });
  it('projects a plan-only failure, but does not let a stale plan override a fresh run', () => {
    const input = { ...delayed(), plan: { status: 'failed', failedReason: 'liv_cost_manual_writer_only',
      topicHint: 'Anmeldelse: Saveus i Royal Arena', editorialKind: 'review' } };
    expect(project(input).blockerCodes).toContain('paid_automation_disabled');
    const c = project({ ...input, runs: [{ id: 'prepare-2026-10-28', row: { status: 'processing',
      processingStartedAt: input.now.getTime(), articleCheckpoint: { title: input.plan.topicHint, articleFormat: 'research-review' } } }] });
    expect(c.blockerCodes).not.toContain('paid_automation_disabled');
    expect(c.title).toBe(input.plan.topicHint); expect(c.retainedTopic).toBeNull();
  });
  it.each(['liv_cost_context_blocked', 'liv_cost_policy_missing_or_expired', 'liv_cost_ledger_requires_reconciliation'])(
    'does not diagnose %s as exhausted money or suggest a paid retry', reason => {
      const c = project({ ...delayed(), runs: [{ id: 'prepare-2026-10-28', row: { status: 'failed', reason } }] });
      expect(c.blockerCodes).toEqual(['cost_control_blocked']);
      expect(renderDeliveryAlert('failure', c).text).not.toMatch(/budget_limit|POST \/api\/liv\/operations\/retry/);
    });
  it('preserves published history despite an old policy failure or off-remit title', () => {
    const input = delayed(); input.state.entries.push(entry({ scheduledDay: input.day, title: oldTopic, state: 'published' }));
    input.state.slots[input.day] = { itemId: 'a'.repeat(24), state: 'published', token: 'private', leaseUntil: 0, attempts: 1, nextAttemptAt: 0 };
    const c = project({ ...input, runs: [{ id: 'prepare-2026-10-28', row: stopped() }] });
    expect(c.published).toBe(true); expect(c.title).toBe(oldTopic); expect(c.retainedTopic).toBeNull();
    expect(c.blockerCodes).toEqual([]);
    expect(renderDeliveryAlert('resolved', c).text).not.toContain('POST /api/liv/operations/retry');
  });
});

describe('delivery handoff projection', () => {
  it('explains the actual quota incident and marks an old plan as unverified, not written', () => {
    const c = project({ ...base(), plan: { topicHint: 'Dizzy Mizz Lizzy i Tivoli' }, runs: [
      { id: `prepare-${day}`, row: { status: 'skipped_no_topic', completedAt: now.toISOString() } },
      { id: 'reserve-2026-09-28', row: { status: 'failed', topic: 'Reserve som ikke er dagens artikel', reason: 'research_brief_insufficient' } },
    ] });
    const mail = renderDeliveryAlert('finalFailure', c);
    expect(c.title).toBe('Dizzy Mizz Lizzy i Tivoli');
    expect(c.titleBasis).toContain('Kun planlagt emne');
    expect(c.blockers.join(' ')).toContain('provider_quota_exhausted');
    expect(c.blockers.join(' ')).toContain('Kildebanken');
    expect(c.missing.join(' ')).toContain('Intet artikel-checkpoint');
    expect(c.missing.join(' ')).toContain('cover, brødtekstbillede 1, brødtekstbillede 2');
    expect(c.runs.join(' ')).toContain('reserve-2026-09-28');
    expect(mail.text).toContain('FORTSÆT I DEN EKSISTERENDE REDAKTIONSTRÅD');
    expect(mail.text).toContain('/api/liv/operations/retry');
    expect(mail.text).toContain('Ikke en aktuel providersaldo');
    expect(mail.text).not.toContain('Automatisk behandling fortsætter');
    expect(mail.subject).toContain(c.title);
  });
  it('does not call missing checkpoint lost work or confuse budgets with provider credits', () => {
    const c = project({ ...base(), cost: { month:'2026-10', trackedCalls:1, maxCallsPerMonth:1000, monthlyLimitDkk:300,
      unknownCalls:1, usageBasedUpperDkk:0, reservedUpperDkk:1.2144 } as any });
    expect(c.costs).toContain('1/1000');
    expect(c.costs).toContain('1,2144 kr. reserveret');
    expect(c.missing.join(' ')).toContain('writer-kvitteringer før ny skrivning');
    expect(c.inventory).toContain('2026-10-06');
  });
  it('lists partial assets, saved writer identity and failed gates without leaking diagnostics', () => {
    const c = project({ ...base(), runs: [{ id: `prepare-${day}`, row: { status: 'skipped_factcheck',
      resumeWritingRunId:'eb99845e-7d07-4974-ad32-275240f9be23',
      articleCheckpoint: { title: 'Gemt artikel', content: 'Tekst', preparedMedia: [{role:'hero'},{role:'body-1'}], researchSources:[{url:'https://example.com'}] },
      gateResults: [{name:'factcheck',pass:false,detail:'Bearer do-not-export'}, {name:'tov',pass:true,skipped:true}],
    } }] });
    expect(c.saved.join(' ')).toContain('2/3');
    expect(c.missing.join(' ')).toContain('brødtekstbillede 2');
    expect(c.missing.join(' ')).toContain('faktatjek, tone of voice');
    expect(c.runs.join(' ')).toContain('eb99845e');
    expect(JSON.stringify(c)).not.toContain('do-not-export');
  });
  it('never attaches a scheduled draft failure to a selected reserve', () => {
    const state = emptyDeliveryState(); state.entries.push(entry({ kind:'reserve', title:'Valgt reserve' }));
    state.slots[day] = { itemId:'a'.repeat(24), state:'attempted',token:'secret',leaseUntil:0,attempts:1,nextAttemptAt:0 };
    const c = project({ ...base(), state, runs: [{ id:`prepare-${day}`, row:{ articleCheckpoint:{title:'Forkert artikel',content:'tekst'},
      gateResults:[{name:'factcheck',pass:false}], webflowItemId:'c'.repeat(24) } }] });
    expect(c.title).toBe('Valgt reserve');
    expect(c.blockers.join(' ')).toContain('delivery_reconciliation_required');
    expect(c.missing.join(' ')).not.toContain('faktatjek');
    expect(c.itemId).toBe('a'.repeat(24));
    expect(JSON.stringify(c)).not.toContain('secret');
  });
  it('keeps unknown data unknown and still sends a useful handoff', () => {
    const c = project({ ...base(), provider:null, readFailed:true });
    expect(c.missing.join(' ')).toContain('ukendt, ikke bekræftet manglende');
    expect(c.missing.join(' ')).not.toContain('Mangler i checkpoint: cover');
    expect(c.blockers.join(' ')).toContain('status_unavailable');
    expect(c.costs).toContain('ukendt er ikke nul');
  });
  it('does not export raw secrets, arbitrary links, headers or exception messages', () => {
    const c = project({ ...base(), plan: { topicHint:'Titel\r\nBcc: skjult sk-proj-supersecret Bearer token https://evil.test/?key=password <script>bad</script>' },
      runs:[{ id:`prepare-${day}`, row:{ status:'failed',reason:'secret',resumeWritingRunId:'sk-private' } }] });
    const mail = renderDeliveryAlert('failure', c);
    expect(mail.text).not.toMatch(/supersecret|Bearer token|evil\.test|key=password|sk-private|<script>/);
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
  it('resolution uses verified slot URL only and never instructs republishing', () => {
    const state = emptyDeliveryState(); state.entries.push(entry({state:'published'}));
    state.slots[day] = { itemId:'a'.repeat(24),state:'published',token:'secret',leaseUntil:0,attempts:1,nextAttemptAt:0,
      publicUrl:'https://www.aproposmagazine.com/articles/den-faktiske-artikel?token=secret' };
    const c = project({ ...base(), state }); const mail = renderDeliveryAlert('resolved', c);
    expect(mail.text).toContain('https://www.aproposmagazine.com/articles/den-faktiske-artikel');
    expect(mail.text).not.toContain('?token');
    expect(mail.text).toContain('Genstart ikke');
    expect(mail.text).not.toContain('POST /api/liv/operations/retry');
    state.slots[day].publicUrl='https://evil.test/articles/fake';
    expect(project({ ...base(),state }).publicUrl).toBeNull();
  });
});

it('reads only bounded saved records, hold and cost; a historical day is not tomorrow', async () => {
  const state=emptyDeliveryState(); state.reservePreparation={dayKey:'2026-09-28'};
  m.getAll.mockResolvedValue([{data:()=>({topicHint:'Gemt plan'})}, {data:()=>({status:'skipped_no_topic'})}, {data:()=>undefined}, {data:()=>({status:'failed'})}]);
  const c=await readDeliveryAlertContext(state,day,now);
  expect(m.getAll.mock.calls[0]).toEqual(['livDailyPlan/plan-2026-10-04','livDailyArticles/prepare-2026-10-04',
    'livDailyArticles/prepare-alternative-2026-10-04','livDailyArticles/reserve-2026-09-28']);
  expect(c.title).toBe('Gemt plan');
  expect(m.hold).toHaveBeenCalledTimes(1); expect(m.cost).toHaveBeenCalledTimes(1);
});
it('degrades read failures to a secret-free unknown snapshot', async () => {
  m.getAll.mockRejectedValue(new Error('Bearer secret')); m.hold.mockRejectedValue(new Error('private')); m.cost.mockRejectedValue(new Error('private'));
  const c=await readDeliveryAlertContext(emptyDeliveryState(),day,now);
  expect(c.blockers.join(' ')).toContain('status_unavailable');
  expect(JSON.stringify(c)).not.toMatch(/Bearer secret|private/);
});
