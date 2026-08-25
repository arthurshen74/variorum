/**
 * The protocol registry (DESIGN.md "LLM Provider Interface"): adapters
 * keyed by protocol id. THE list of protocols — the document validator,
 * the endpoint form's selector, and the chat transport all read it.
 */
import type { ApiProtocol, ProtocolAdapter } from './adapter';

/** Every protocol id, in selector order. */
export function apiProtocols(): readonly ApiProtocol[] {
  throw new Error('not implemented: apiProtocols');
}

export function isApiProtocol(value: unknown): value is ApiProtocol {
  void value;
  throw new Error('not implemented: isApiProtocol');
}

export function protocolAdapter(api: ApiProtocol): ProtocolAdapter {
  void api;
  throw new Error('not implemented: protocolAdapter');
}
