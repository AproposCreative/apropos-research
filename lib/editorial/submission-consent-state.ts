/** Historical consent is evidence, never permission for a newer version. */
export function hasCurrentPublicationConsent(row: { uid: string; revision: number; contentHash: string;
  publicationConsent?: { uid: string; revision: number; contentHash: string } | null }) {
  const consent = row.publicationConsent;
  return !!consent && consent.uid === row.uid && consent.revision === row.revision && consent.contentHash === row.contentHash;
}
