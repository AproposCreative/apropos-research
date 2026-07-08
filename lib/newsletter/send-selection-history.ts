import { getRecentManualBroadcastArticleIds, getLastManualBroadcastLead } from '@/lib/newsletter/manual-send-log';
import { getLastWeeklyAutoLead, getRecentWeeklyAutoExclusionSets } from '@/lib/newsletter/weekly-send-history';

export async function getRecentNewsletterExclusionSets(
  fullLimit: number,
  relaxLimit: number
): Promise<{ excludeFull: Set<string>; excludeRelax: Set<string> }> {
  const [{ excludeFull, excludeRelax }, manualFull, manualRelax] = await Promise.all([
    getRecentWeeklyAutoExclusionSets(fullLimit, relaxLimit),
    getRecentManualBroadcastArticleIds(fullLimit),
    getRecentManualBroadcastArticleIds(relaxLimit),
  ]);

  for (const id of manualFull) excludeFull.add(id);
  for (const id of manualRelax) excludeRelax.add(id);
  return { excludeFull, excludeRelax };
}

export async function getLatestNewsletterLeadArticleId(): Promise<string | null> {
  const [autoLead, manualLead] = await Promise.all([
    getLastWeeklyAutoLead(),
    getLastManualBroadcastLead(),
  ]);
  const autoTs = autoLead.finishedAt ? Date.parse(autoLead.finishedAt) : Number.NEGATIVE_INFINITY;
  const manualTs = manualLead.finishedAt ? Date.parse(manualLead.finishedAt) : Number.NEGATIVE_INFINITY;

  if (manualTs > autoTs) return manualLead.leadId;
  return autoLead.leadId;
}
