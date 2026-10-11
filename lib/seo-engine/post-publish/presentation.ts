/** Browser-safe labels. Unknown reason codes must not turn success into failure. */
export const seoReasonLabels: Record<string, string> = {
  verified_public_metadata: 'Metadata er kontrolleret på den publicerede side.',
  chatgpt_metadata_public_verified: 'ChatGPTs metadataforslag er gemt og kontrolleret på den publicerede side.',
  reconciled_public_metadata: 'Den tidligere opdatering er nu bekræftet på den publicerede side.',
  chatgpt_metadata_reconciled: 'Den gemte opdatering er bekræftet ved readback. Ingen gentaget skrivning.',
  awaiting_chatgpt_review: 'Artiklen er reserveret til ChatGPTs redaktionelle vurdering.',
  proposal_saved_not_published: 'Forslaget er gemt, men endnu ikke anvendt på den offentlige artikel.',
  no_unlocked_improvement: 'De aktuelle metadata er beholdt.',
  editorial_locks: 'Redaktionens feltlåse er respekteret.',
  cooldown: 'Metadata er ændret for nylig. Der ventes før en ny optimering.',
  article_changed: 'Artiklen er ændret siden vurderingen.',
  insufficient_performance_evidence: 'Der er endnu ikke tilstrækkelige sammenlignelige søgedata.',
  editorial_uncertainty: 'Vurderingen kræver en redaktør.',
  unverified_proposal: 'Forslaget kunne ikke verificeres mod artiklen.',
  auto_disabled: 'Automatikken er sat på pause.',
  article_write_pending: 'En tidligere opdatering af artiklen afventer kontrol.',
  seo_public_metadata_pending: 'Opdateringen er endnu ikke bekræftet på den offentlige side.',
  seo_metadata_duplicate: 'Forslaget matcher en anden artikels metadata og er ikke gemt.',
};
const labels: Record<string, string> = { queued: 'I kø', waiting_budget: 'Afventer', running: 'Vurderes',
  verify_pending: 'Afventer live-kontrol', kept: 'Beholdt', applied: 'Verificeret live',
  needs_editor: 'Kræver gennemgang', stale: 'Grundlaget ændret', failed: 'Fejlet' };
export function seoStatusPresentation(row: { status: string; reason: string | null; publicReceipt: unknown }) {
  const verified = !!row.publicReceipt && ['applied', 'kept'].includes(row.status);
  const label = row.status === 'applied' && !verified ? 'Afventer dokumenteret live-kontrol' : labels[row.status] || 'Ukendt status';
  const fallback = row.status === 'failed' ? 'Kontrollen kunne ikke gennemføres.' : verified
    ? 'Resultatet er kontrolleret på den offentlige side.' : `${label}. Se den gemte status nedenfor.`;
  const missingReceipt = ['applied', 'kept'].includes(row.status) && !verified;
  return { label, verified, reason: missingReceipt ? 'Resultatet mangler en offentlig kontrolkvittering og er ikke verificeret live.' : row.reason && seoReasonLabels[row.reason] || fallback,
    showTechnicalCode: !!row.reason && !seoReasonLabels[row.reason] };
}
export const seoHealthLabels: Record<string, string> = {
  scheduled_run_not_observed: 'Ingen kørsel med dagens planlagte identitet er modtaget. Kontrollér cloudopgaven og dens forbindelse; årsagen er endnu ukendt.',
  scheduled_run_incomplete: 'Den modtagne kørsel er ikke afsluttet efter to timer. Genoptag det gemte arbejde.',
  service_access_failed: 'En gemt fejl viser afvist eller manglende serviceadgang. Kontrollér den berørte forbindelse.',
  claim_failed: 'Afhentning af SEO-opgaver fejlede. Det gemte batch kan genoptages.',
  write_readback_pending: 'En påbegyndt opdatering mangler readback. Kontrollér resultatet før en eventuel ny skrivning.',
  review_stalled: 'En reserveret vurdering har stået stille i over to timer.',
  editorial_attention: 'Et forslag kræver redaktionel opfølgning eller nyt versionsgrundlag.',
};
