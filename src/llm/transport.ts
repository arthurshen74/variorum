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

// The dead global endpoint keys (DESIGN.md "Model Bindings"). Nothing in
// the request path reads them any more; they survive only until the
// Endpoint view that still imports them is replaced by the Models view.
const BASE_URL_KEY = 'variorum.baseUrl';
const API_KEY_KEY = 'variorum.apiKey';

export const DEFAULT_BASE_URL = 'http://localhost:1234/v1'; // LM Studio default

export function getBaseUrl(): string {
  return localStorage.getItem(BASE_URL_KEY) ?? DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string): void {
  localStorage.setItem(BASE_URL_KEY, url);
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/** Boundary validation: trimmed, parseable, http(s)-schemed URL — or null. */
export function parseBaseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) return null;

  // The trimmed input, not parsed.href: normalization would append a
  // trailing slash and the Endpoint field would change under the user.
  return trimmed;
}

/** Reset: remove the stored value so the default shows through. */
export function clearBaseUrl(): void {
  localStorage.removeItem(BASE_URL_KEY);
}

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key);
}

/** Boundary normalization: the trimmed key, or null when empty/whitespace-only. */
export function normalizeApiKey(input: string): string | null {
  const trimmed = input.trim();
  return trimmed === '' ? null : trimmed;
}

/** Unset: remove the stored key so requests carry no Authorization header. */
export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_KEY);
}
