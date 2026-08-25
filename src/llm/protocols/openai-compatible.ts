/**
 * The OpenAI-compatible chat-completions adapter (DESIGN.md "LLM Provider
 * Interface"): `<url>/chat/completions` via @ai-sdk/openai-compatible,
 * Bearer auth, no output cap, and the body splice for the two recipe
 * fields the provider cannot express (`top_k`, `reasoning_effort`).
 */
import type { ProtocolAdapter } from './adapter';

export const openAiCompatibleAdapter: ProtocolAdapter = {
  id: 'openai-compatible',
  label: 'OpenAI Chat Completions',
  usesMaxOutputTokens: false,
  prepareRequest() {
    throw new Error('not implemented: openAiCompatibleAdapter.prepareRequest');
  },
};
