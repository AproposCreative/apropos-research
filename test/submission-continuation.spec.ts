import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ read: vi.fn(), step: vi.fn() }));
vi.mock('@/lib/editorial/submissions', () => ({ readSubmission: state.read }));
vi.mock('@/lib/editorial/submission-worker', () => ({ runSubmissionStep: state.step }));
import { continueSubmissionPreparation } from '@/lib/editorial/submission-continuation';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
beforeEach(() => { vi.clearAllMocks(); state.read.mockResolvedValue({ executionPolicy: 'chatgpt-first-v1', status: 'processing' }); });
it('finishes zero-AI steps in one bounded continuation without removing stage protection', async () => {
  state.step.mockImplementation(async () => { expect(() => assertPaidAiAllowed()).toThrow(); return { status: state.step.mock.calls.length < 6 ? 'processing' : 'prepared' }; });
  expect(await continueSubmissionPreparation('owner', 'id')).toEqual({ status: 'prepared' }); expect(state.step).toHaveBeenCalledTimes(6);
});
it.each(['blocked', 'not_dispatched', 'published'])('never loops a failed/busy/terminal result: %s', async status => {
  state.step.mockResolvedValue({ status }); await continueSubmissionPreparation('owner', 'id'); expect(state.step).toHaveBeenCalledTimes(1);
});
it('bounds processing and leaves legacy execution unchanged', async () => {
  state.step.mockResolvedValue({ status: 'processing' }); await continueSubmissionPreparation('owner', 'id'); expect(state.step).toHaveBeenCalledTimes(8);
  state.step.mockClear(); state.read.mockResolvedValue({ executionPolicy: 'chat-final-checks-v1' });
  await continueSubmissionPreparation('owner', 'id'); expect(state.step).toHaveBeenCalledTimes(1);
});
