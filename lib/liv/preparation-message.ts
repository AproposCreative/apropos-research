import type { LivNextPreparationStatus } from './preparation-status';
/** Shared, closed UI copy. Never render raw provider/CMS exceptions. */
export function preparationMessage(status?: LivNextPreparationStatus) {
  if (!status) return 'Forberedelsens status er ukendt.';
  const reasons: Partial<Record<LivNextPreparationStatus['reasonCode'], string>> = {
    provider_quota_exhausted: 'AI-udbyderens credits eller forbrugsgrænse er opbrugt. Gemt arbejde er bevaret.',
    provider_unavailable: 'AI-udbyderen afviser kald lige nu. Gemt arbejde er bevaret; ingen automatisk ny bestilling.',
    authentication_required: 'Serveren mangler gyldig API-adgang.',
    budget_limit: 'Budgetkontrollen har stoppet forberedelsen. Gemt arbejde er bevaret.',
    cms_reconciliation_required: 'Den gemte artikel skal afstemmes med Webflow, før den kan udgives.',
    delivery_reconciliation_required: 'En påbegyndt udgivelse mangler bekræftelse. Den bliver ikke bestilt igen.',
    source_evidence_required: 'Der mangler læsbart kildemateriale.',
    factcheck_required: 'Artiklens faktatjek kræver rettelse.',
    provider_result_unconfirmed: 'Et AI-kald har ukendt udfald. Resultatet må afklares før et nyt kald.',
    source_retry_scheduled: 'Kildesøgningen er forsinket. Liv forsøger automatisk igen.',
    no_preparation_needed: 'Køen er klar; ingen ny forberedelse nødvendig.',
    article_correction_required: 'Liv retter artiklens længde eller faktuelle fejl. Tekst og billeder genbruges.',
    alternative_limit_reached: 'Dagens to mulige historier kunne ikke færdiggøres. Ingen flere betalte forsøg.',
  };
  return reasons[status.reasonCode] ?? (status.status === 'preparing' ? 'Liv arbejder på historien nu.' :
    status.status === 'queued' ? 'Historien afventer næste forberedelse.' :
    status.status === 'unavailable' ? 'Forberedelsens status kunne ikke hentes.' :
    'Forberedelsen er stoppet på et gemt trin. Tekst og billeder er bevaret.');
}
