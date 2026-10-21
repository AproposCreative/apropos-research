import { requireFirestore } from './persistence/firestore-kit';

export const PERSONAL_ACCREDITATION_POLICY = 'personal-owner-approval-v1';
/** A separate owner-authorized channel. Does not relax legacy dry-run, redirect or automation. */
export async function getPersonalAccreditationPolicy(ownerUid: string) {
  const row = (await requireFirestore().collection('accreditationMcpPolicy').doc('personal').get()).data();
  return {
    mode: PERSONAL_ACCREDITATION_POLICY,
    enabled: row?.mode === PERSONAL_ACCREDITATION_POLICY && row.enabled === true && row.ownerUid === ownerUid,
    globalSendStopped: process.env.EDITORIAL_MAIL_SENDING_ENABLED === 'false' || process.env.ACCREDITATION_DRY_RUN === 'true',
    requiresPersonalConfirmation: true, automaticSendAllowed: false,
    recipientPolicy: 'exact-personally-approved-preview',
    legacySettingsChanged: false, authorizedAt: row?.authorizedAt || null,
  };
}
export async function assertPersonalAccreditationPolicy(ownerUid: string) {
  const policy = await getPersonalAccreditationPolicy(ownerUid);
  if (!policy.enabled) throw Error('mcp_accreditation_personal_send_disabled');
  if (policy.globalSendStopped) throw Error('mcp_accreditation_sending_disabled');
}
