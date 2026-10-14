import { getWebApps, type WebAppEntry } from './web-apps-config';
import { canOpenEditorialApp, type EditorialCapabilities } from './editorial-capabilities';
export type ToolEntry = WebAppEntry & { hidden: boolean; status: string | null };
export type ToolSignals = { paidAiBlocked: boolean | null; accreditationPaused: boolean | null; inboxAutoRespond: boolean | null;
  manualWriterOnly?: boolean | null; manualWriterBudgetAvailable?: boolean | null };
export type ToolCatalogue = { checkedAt: string; tools: ToolEntry[] };

/** Unknown is not paused or healthy. An old last-used date is not a pause. */
export function describeTools(signals: ToolSignals, capabilities: EditorialCapabilities): ToolEntry[] {
  return getWebApps().filter(app => canOpenEditorialApp(app.id, capabilities)).map(app => {
    let hidden = false;
    let status: string | null = null;
    if (['ai-writer', 'image-gen'].includes(app.id)) {
      hidden = signals.paidAiBlocked === true;
      status = hidden ? 'API-produktion stoppet. Brug Redaktionen i ChatGPT.' :
        signals.paidAiBlocked === null ? 'API-status kunne ikke bekræftes.' : 'Bruger separat betalt API.';
      if (signals.manualWriterOnly === true) {
        hidden = app.id === 'image-gen' || signals.paidAiBlocked === true || signals.manualWriterBudgetAvailable === false;
        status = app.id === 'image-gen' ? 'Betalt billedgenerering er pauset. Brug Redaktionen i ChatGPT.' :
          signals.paidAiBlocked === true ? 'Afventer genåbning af API-kontoen. Noter og kladder er bevaret.' :
          signals.manualWriterBudgetAvailable === false ? 'Writers engangsloft er nået. Noter og kladder er bevaret.' :
          signals.manualWriterBudgetAvailable === null || signals.paidAiBlocked === null ? 'Writer-status kunne ikke bekræftes.' :
          'Manuel skrivning og research. Fælles engangsloft: 50 kr. Ingen automatisk optankning.';
      }
    } else if (app.id === 'akkreditering') {
      hidden = signals.accreditationPaused === true;
      status = hidden ? 'Automatik pauset. Historik og kladder er bevaret.' :
        signals.accreditationPaused === null ? 'Automatikstatus kunne ikke bekræftes.' : null;
    } else if (app.id === 'liv-inbox') {
      // The manual review desk remains useful independently of automatic replies.
      status = signals.inboxAutoRespond === false ? 'Autosvar slået fra. Manuel gennemgang er tilgængelig.' :
        signals.inboxAutoRespond === null ? 'Autosvarstatus kunne ikke bekræftes.' : null;
    }
    return { ...app, hidden, status };
  });
}
