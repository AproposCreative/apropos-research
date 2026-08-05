import type { ApprovalItem, ApprovalPolicyFlag, ContactConfidence } from '@/lib/accreditation/types';

const ESCALATION_FLAGS: ApprovalPolicyFlag[] = [
  'lowConfidence',
  'ambiguous',
  'credentialsOrCaptcha',
  'paymentOrLegal',
  'sensitivePersonalData',
  'unsafeToolAction',
  'promptInjectionSuspected',
];

/**
 * Risk-based autonomy (v1):
 * Auto-send routine high-confidence first outreach, follow-ups, ordinary replies,
 * and applicant notices. Escalate only for explicit risk flags.
 */
export function canAutoSend(item: ApprovalItem): boolean {
  if (!item.autoEligible) return false;
  if (item.policyFlags.some((f) => ESCALATION_FLAGS.includes(f))) return false;
  // novelQuestion alone does not block if it's ordinary press Q&A — only with ambiguous
  if (item.policyFlags.includes('novelQuestion') && item.policyFlags.includes('ambiguous')) {
    return false;
  }
  return true;
}

export function buildPolicyFlags(params: {
  kind: ApprovalItem['kind'];
  contactConfidence?: ContactConfidence;
  ambiguous?: boolean;
  novelQuestion?: boolean;
  routineFollowUp?: boolean;
  credentialsOrCaptcha?: boolean;
  paymentOrLegal?: boolean;
  sensitivePersonalData?: boolean;
  unsafeToolAction?: boolean;
  promptInjectionSuspected?: boolean;
}): ApprovalPolicyFlag[] {
  const flags: ApprovalPolicyFlag[] = [];
  if (params.contactConfidence === 'low') flags.push('lowConfidence');
  if (params.ambiguous) flags.push('ambiguous');
  if (params.novelQuestion) flags.push('novelQuestion');
  if (params.kind === 'applicant_notice') flags.push('affectsApplicant');
  if (params.routineFollowUp) flags.push('routineFollowUp');
  if (params.credentialsOrCaptcha) flags.push('credentialsOrCaptcha');
  if (params.paymentOrLegal) flags.push('paymentOrLegal');
  if (params.sensitivePersonalData) flags.push('sensitivePersonalData');
  if (params.unsafeToolAction) flags.push('unsafeToolAction');
  if (params.promptInjectionSuspected) flags.push('promptInjectionSuspected');
  return flags;
}

export function assertSendAllowed(item: ApprovalItem): void {
  if (canAutoSend(item)) return;
  if (item.status === 'approved') return;
  throw new Error(
    `Escalation required before send (${item.policyFlags.join(', ') || 'not auto-eligible'})`
  );
}

/** @deprecated use assertSendAllowed */
export function assertHumanApprovalRequired(item: ApprovalItem): void {
  assertSendAllowed(item);
}

export function computeAutoEligible(flags: ApprovalPolicyFlag[]): boolean {
  return !flags.some((f) => ESCALATION_FLAGS.includes(f));
}

export function detectUntrustedInstructionInjection(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    /ignore (all |previous |your )*instructions/,
    /ignore all previous instructions/,
    /system prompt/,
    /du skal nu ændre (din )?politik/,
    /override (policy|sikkerhed|safety)/,
    /disregard (your )?(rules|policy)/,
    /act as (root|admin|developer)/,
    /\[\[system\]\]/,
  ];
  return patterns.some((p) => p.test(t));
}

export function detectEscalationHeuristics(text: string): ApprovalPolicyFlag[] {
  const flags: ApprovalPolicyFlag[] = [];
  const t = text.toLowerCase();
  if (detectUntrustedInstructionInjection(text)) flags.push('promptInjectionSuspected');
  if (/captcha|login|password|adgangskode|2fa|credentials|cookie/.test(t)) {
    flags.push('credentialsOrCaptcha');
  }
  if (/betaling|payment|invoice|faktura|kontrakt|nda|juridisk|legal liability/.test(t)) {
    flags.push('paymentOrLegal');
  }
  if (/cpr[- ]?nr|pasnummer|privat adresse|sensitive/.test(t)) {
    flags.push('sensitivePersonalData');
  }
  return flags;
}
