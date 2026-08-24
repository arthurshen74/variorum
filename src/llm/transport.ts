/**
 * The LLM transport (DESIGN.md "LLM Provider Interface"): one language
 * model per request, spoken to directly from the browser over whichever
 * wire protocol the model's binding names — OpenAI-compatible via
 * @ai-sdk/openai-compatible, Anthropic Messages via @ai-sdk/anthropic.
 * Both plug into the same streamText path, so the chat pipeline above
 * does not fork.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { ModelBinding } from './model-binding';

// Anthropic's sanctioned opt-in for browser-origin requests. The provider
// does not send it; api.anthropic.com refuses a browser origin without it.
export const ANTHROPIC_BROWSER_HEADER =
  'anthropic-dangerous-direct-browser-access';

const ANTHROPIC_KEY_HEADER = 'x-api-key';

const OPENAI_COMPATIBLE_PROVIDER_NAME = 'variorum-local';

/** Wraps fetch to strip the key header off every request. */
function withoutKeyHeader(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete(ANTHROPIC_KEY_HEADER);
    return base(input, { ...init, headers });
  };
}

/** The Messages provider: `<endpointUrl>/messages`, browser access opted in. */
function anthropicModel(
  binding: ModelBinding,
  modelName: string,
  fetchImpl?: typeof fetch,
): LanguageModel {
  const baseFetch = fetchImpl ?? globalThis.fetch;
  // createAnthropic resolves the key eagerly: with no `apiKey` it throws,
  // and where a process exists it would silently read ANTHROPIC_API_KEY.
  // Omission therefore cannot express "no key" — a placeholder goes in and
  // the header it produces is stripped back off the request.
  const anthropic = createAnthropic({
    baseURL: binding.endpointUrl,
    apiKey: binding.apiKey ?? '',
    headers: { [ANTHROPIC_BROWSER_HEADER]: 'true' },
    fetch:
      binding.apiKey === undefined ? withoutKeyHeader(baseFetch) : baseFetch,
  });
  return anthropic(modelName);
}

/** The OpenAI-compatible provider: `<endpointUrl>/chat/completions`. */
function openAiCompatibleModel(
  binding: ModelBinding,
  modelName: string,
  fetchImpl?: typeof fetch,
): LanguageModel {
  // No key in the binding means no apiKey option, and so no Authorization
  // header — an endpoint that wants one answers with its own auth error.
  const provider = createOpenAICompatible({
    name: OPENAI_COMPATIBLE_PROVIDER_NAME,
    baseURL: binding.endpointUrl,
    // Puts stream_options.include_usage on every request: without it no
    // OpenAI-compatible surface reports token usage for a stream at all.
    includeUsage: true,
    ...(binding.apiKey !== undefined ? { apiKey: binding.apiKey } : {}),
    ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
  });
  return provider(modelName);
}

/**
 * One language model per request, built from the binding's protocol. The
 * model id, system prompt, and sampling parameters come from the active
 * configuration version at call time — never from here.
 */
export function createModel(
  binding: ModelBinding,
  modelName: string,
  fetchImpl?: typeof fetch,
): LanguageModel {
  return binding.api === 'anthropic-messages'
    ? anthropicModel(binding, modelName, fetchImpl)
    : openAiCompatibleModel(binding, modelName, fetchImpl);
}
