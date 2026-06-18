import type { ApplicationSection, FundingResearchResult } from '@/lib/funding/types';

export const FUNDING_BRIEF_CONTEXT_KEY = 'apropos-funding-brief-context';

export type FundingBriefHandoff = {
  briefText: string;
  fundingResearch?: FundingResearchResult;
  opportunityId: string;
  opportunityTitle: string;
  applicationSection: ApplicationSection;
};

export function writeFundingBriefHandoff(payload: FundingBriefHandoff): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(FUNDING_BRIEF_CONTEXT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function readFundingBriefHandoff(): FundingBriefHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(FUNDING_BRIEF_CONTEXT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FundingBriefHandoff;
  } catch {
    return null;
  }
}

export function clearFundingBriefHandoff(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(FUNDING_BRIEF_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}
