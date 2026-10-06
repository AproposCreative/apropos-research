/** Safe diagnostics only. Never carry a signed URL, path, query or file contents. */
export class ChatFileError extends Error {
  constructor(readonly code: 'mcp_submission_file_host_invalid' | 'mcp_submission_file_reference_invalid' | 'mcp_submission_file_download_failed',
    readonly hostname?: string) {
    super(code);
    this.name = 'ChatFileError';
  }
}

export function chatFileRecovery(error: unknown) {
  if (!(error instanceof ChatFileError)) return null;
  return {
    error: error.code,
    ...(error.hostname ? { rejectedHost: error.hostname } : {}),
    stage: 'file_download', articleChanged: false, regenerateImage: false,
    action: error.code === 'mcp_submission_file_host_invalid'
      ? 'Filens downloadhost understøttes ikke. Billedet er ikke importeret. Bevar den eksisterende fil og meld rejectedHost til Apropos; opfind ikke en URL og gentag ikke samme afviste kald.'
      : 'ChatGPT skal give den eksisterende fil en gyldig, midlertidig downloadadresse via file-inputtet. Et file-ID eller sandbox:/mnt/data er ikke i sig selv en adresse, serveren kan hente. Ved udløb: vedhæft den samme eksisterende fil igen og genbrug importens requestId. Generér ikke billedet igen.',
    paidAiAllowed: false,
  };
}
