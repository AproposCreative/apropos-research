import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import type { ApplicationStatus, FundingApplication } from '@/lib/funding/types';

const FILENAME = 'funding_applications.json';

export function readApplications(): FundingApplication[] {
  return readJsonFile<FundingApplication[]>(FILENAME, []);
}

export function writeApplications(apps: FundingApplication[]): void {
  writeJsonFile(FILENAME, apps);
}

export function getApplicationById(id: string): FundingApplication | undefined {
  return readApplications().find((a) => a.id === id);
}

export function getApplicationByOpportunityId(opportunityId: string): FundingApplication | undefined {
  return readApplications().find((a) => a.opportunityId === opportunityId);
}

export function createApplication(input: {
  opportunityId: string;
  opportunityTitle?: string;
  funder?: string;
  status?: ApplicationStatus;
  notes?: string;
  primaryContactEmail?: string;
}): FundingApplication {
  const now = new Date().toISOString();
  const existing = getApplicationByOpportunityId(input.opportunityId);
  if (existing) return existing;

  const app: FundingApplication = {
    id: `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    opportunityId: input.opportunityId,
    opportunityTitle: input.opportunityTitle,
    funder: input.funder,
    status: input.status || 'discovered',
    notes: input.notes,
    primaryContactEmail: input.primaryContactEmail,
    createdAt: now,
    updatedAt: now,
  };
  const all = readApplications();
  all.push(app);
  writeApplications(all);
  return app;
}

export function updateApplication(
  id: string,
  patch: Partial<Pick<FundingApplication, 'status' | 'notes' | 'primaryContactEmail' | 'submittedAt'>>
): FundingApplication | null {
  const all = readApplications();
  const index = all.findIndex((a) => a.id === id);
  if (index < 0) return null;
  const updated: FundingApplication = {
    ...all[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  all[index] = updated;
  writeApplications(all);
  return updated;
}
