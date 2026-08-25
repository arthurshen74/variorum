/**
 * The OpenAI-compatible chat-completions adapter (DESIGN.md "LLM Provider
 * Interface"): `<url>/chat/completions` via @ai-sdk/openai-compatible,
 * Bearer auth, no output cap, and the body splice for the two recipe
 * fields the provider cannot express (`top_k`, `reasoning_effort`).
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ConfigurationVersion } from '@/domain/types';
import type { ProtocolAdapter } from './adapter';

const PROVIDER_NAME = 'variorum-local';

const BODY_TOP_K = 'top_k';
const BODY_REASONING_EFFORT = 'reasoning_effort';

/**
 * The provider reports topK as unsupported, and reaches reasoning effort
 * only through a provider-name-keyed option.
 */
function extraBodyFields(
  version: ConfigurationVersion,
): Record<string, unknown> {
  return {
    ...(version.topK !== undefined ? { [BODY_TOP_K]: version.topK } : {}),
    ...(version.reasoningEffort !== undefined
      ? { [BODY_REASONING_EFFORT]: version.reasoningEffort }
      : {}),
  };
}

/** Wraps fetch to merge extra fields into the JSON request body. */
function withExtraBodyFields(
  base: typeof fetch,
  extra: Record<string, unknown>,
): typeof fetch {
  if (Object.keys(extra).length === 0) return base;
  return async (input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return base(input, {
      ...init,
      body: JSON.stringify({ ...body, ...extra }),
    });
  };
}

export const openAiCompatibleAdapter: ProtocolAdapter = {
  id: 'openai-compatible',
  label: 'OpenAI Chat Completions',
  usesMaxOutputTokens: false,
  prepareRequest(resolved, version, fetchImpl) {
    // No key means no apiKey option, and so no Authorization header — an
    // endpoint that wants one answers with its own auth error.
    const provider = createOpenAICompatible({
      name: PROVIDER_NAME,
      baseURL: resolved.url,
      // Puts stream_options.include_usage on every request: without it no
      // OpenAI-compatible surface reports token usage for a stream at all.
      includeUsage: true,
      ...(resolved.apiKey !== undefined ? { apiKey: resolved.apiKey } : {}),
      fetch: withExtraBodyFields(fetchImpl, extraBodyFields(version)),
    });
    return { model: provider(resolved.modelId), options: {} };
  },
};
