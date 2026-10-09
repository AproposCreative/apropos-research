import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { TEXT_FREE_IMAGE_POLICY } from '@/lib/images/text-free-policy';

/** Selection guidance, not an image inspection or permission to change approved bytes. */
export const COVER_SELECTION_INSTRUCTION = 'Nye artikelcovers og mobilcovers skal være uden synlig tekst, titler, datoer, logoer og vandmærker. Vælg et ægte tekstfrit presse- eller spilbillede frem for plakat, titelgrafik eller key art med tekst. Se selve billedet: filnavn og officiel kilde beviser ikke, at det er tekstfrit. Vælg et andet originalbillede før retouchering; denne vejledning bestiller ingen AI-kontrol eller retouchering og giver ikke lov til at beskære eller fjerne rettighedsmarkeringer. Bevar faktisk kilde og kredit uden for billedet; ukendte rettigheder forbliver ukendte. Ændr ikke tidligere personligt godkendte billedfiler eller bogcover-særvalg lydløst. Et særskilt logo-bånd i lydafspilleren er visningsgrafik, ikke artikelcoveret.';

export function coverSelectionPolicy() {
  const policy = {
    version: 'apropos-cover-selection-2026-10-09-v1',
    imagePolicyVersion: TEXT_FREE_IMAGE_POLICY,
    instruction: COVER_SELECTION_INSTRUCTION,
    visualInspectionPerformed: false,
    publicationApproval: false,
  };
  return { ...policy, policyHash: cmsFieldHash(policy) };
}
