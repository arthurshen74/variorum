/**
 * The Anthropic Messages adapter (DESIGN.md "LLM Provider Interface"):
 * `<url>/messages` via @ai-sdk/anthropic, x-api-key auth, the browser
 * access opt-in header, and the mandatory output cap.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ProtocolAdapter } from './adapter';

// Anthropic's sanctioned opt-in for browser-origin requests. The provider
// does not send it; api.anthropic.com refuses a browser origin without it.
export const ANTHROPIC_BROWSER_HEADER =
  'anthropic-dangerous-direct-browser-access';

export const DEFAULT_MAX_OUTPUT_TOKENS = 32000;

const KEY_HEADER = 'x-api-key';

/** Wraps fetch to strip the key header off every request. */
function withoutKeyHeader(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete(KEY_HEADER);
    return base(input, { ...init, headers });
  };
}

export const anthropicMessagesAdapter: ProtocolAdapter = {
  id: 'anthropic-messages',
  label: 'Anthropic Messages',
  usesMaxOutputTokens: true,
  prepareRequest(resolved, version, fetchImpl) {
    // createAnthropic resolves the key eagerly: with no `apiKey` it throws,
    // and where a process exists it would silently read ANTHROPIC_API_KEY.
    // Omission therefore cannot express "no key" — a placeholder goes in and
    // the header it produces is stripped back off the request.
    const anthropic = createAnthropic({
      baseURL: resolved.url,
      apiKey: resolved.apiKey ?? '',
      headers: { [ANTHROPIC_BROWSER_HEADER]: 'true' },
      fetch:
        resolved.apiKey === undefined ? withoutKeyHeader(fetchImpl) : fetchImpl,
    });
    return {
      model: anthropic(resolved.modelId),
      // max_tokens is mandatory on this wire. topK goes through the provider
      // rather than a body splice so its per-model capability table can gate
      // it (DESIGN.md "LLM Provider Interface").
      options: {
        maxOutputTokens: resolved.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        ...(version.topK !== undefined ? { topK: version.topK } : {}),
      },
    };
  },
};
