/** Owner-approved reviewed mode. This is not an independent native-input observer.
 * Complete server-side inputs allow one attempt; actual host delivery is still a
 * client obligation. No model flag can turn unknown hidden processing into proof. */
export const NATIVE_IMAGE_INTEGRATION = Object.freeze({
  version: 'native-image-reviewed-v31', host: 'chatgpt-native',
  mode: 'personal-output-selection', available: true,
  inputObservation: 'unavailable', exactPromptExecutionVerified: false,
  code: 'mcp_submission_native_input_unverifiable',
  dependency: 'The host must receive the complete canonical prompt and actual ordered reference images. Hidden native processing remains unobservable. Missing actual delivery still stops generation; a client report never proves hidden execution.',
} as const);
