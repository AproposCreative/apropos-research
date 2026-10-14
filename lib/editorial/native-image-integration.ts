/** Server-owned capability, NEVER a model argument, env opt-out or self-attested
 * generationReport. No supported authenticated native input observer is installed.
 * Do not enable generation until an actual host bridge is implemented and tested. */
export const NATIVE_IMAGE_INTEGRATION = Object.freeze({
  version: 'native-image-preflight-v30', host: 'chatgpt-native',
  available: false, inputObservation: 'unavailable', exactPromptExecutionVerified: false,
  code: 'mcp_submission_native_input_unverifiable',
  dependency: 'An authenticated native host bridge that binds the exact prompt and ordered actual reference bytes to this brief BEFORE dispatch, and the original output to the same execution receipt. MCP image blocks and client-reported hashes alone do not provide that bridge.',
} as const);

export function assertNativeImageIntegration(): never {
  throw Error(NATIVE_IMAGE_INTEGRATION.code);
}
