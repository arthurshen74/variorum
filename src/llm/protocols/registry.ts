/**
 * The protocol registry (DESIGN.md "LLM Provider Interface"): adapters
 * keyed by protocol id. THE list of protocols — the document validator,
 * the endpoint form's selector, and the chat transport all read it.
 */
import type { ApiProtocol, ProtocolAdapter } from './adapter';
import { anthropicMessagesAdapter } from './anthropic-messages';
import { openAiCompatibleAdapter } from './openai-compatible';

// Key order is selector order.
const ADAPTERS: Record<ApiProtocol, ProtocolAdapter> = {
  'openai-compatible': openAiCompatibleAdapter,
  'anthropic-messages': anthropicMessagesAdapter,
};

/** Every protocol id, in selector order. */
export function apiProtocols(): readonly ApiProtocol[] {
  return Object.keys(ADAPTERS) as ApiProtocol[];
}

export function isApiProtocol(value: unknown): value is ApiProtocol {
  return typeof value === 'string' && value in ADAPTERS;
}

export function protocolAdapter(api: ApiProtocol): ProtocolAdapter {
  return ADAPTERS[api];
}
