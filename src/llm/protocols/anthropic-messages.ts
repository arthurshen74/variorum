/**
 * The Anthropic Messages adapter (DESIGN.md "LLM Provider Interface"):
 * `<url>/messages` via @ai-sdk/anthropic, x-api-key auth, the browser
 * access opt-in header, and the mandatory output cap.
 */
import type { ProtocolAdapter } from './adapter';

// Anthropic's sanctioned opt-in for browser-origin requests. The provider
// does not send it; api.anthropic.com refuses a browser origin without it.
export const ANTHROPIC_BROWSER_HEADER =
  'anthropic-dangerous-direct-browser-access';

export const DEFAULT_MAX_OUTPUT_TOKENS = 32000;

export const anthropicMessagesAdapter: ProtocolAdapter = {
  id: 'anthropic-messages',
  label: 'Anthropic Messages',
  usesMaxOutputTokens: true,
  prepareRequest() {
    throw new Error('not implemented: anthropicMessagesAdapter.prepareRequest');
  },
};
