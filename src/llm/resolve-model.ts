/**
 * Handle resolution (DESIGN.md "Models and Providers", "Resolution" and
 * "Keys"): a configuration's model handle → the endpoint, protocol, wire
 * id, key, and cap the adapters consume. Pure over the document passed
 * in; the two failure modes are the two request-time errors.
 */
import type { ResolvedModel } from './protocols/adapter';
import type { ProviderDocument } from './provider-document';

export function unboundModelMessage(handle: string): string {
  return `no endpoint bound for model ${handle}, please check your models/providers configuration`;
}

export function missingApiKeyMessage(handle: string, url: string): string {
  return `no API key for model ${handle}: endpoint ${url} requires authentication, please check your models/providers configuration`;
}

export class UnboundModelError extends Error {
  constructor(handle: string) {
    super(unboundModelMessage(handle));
    this.name = 'UnboundModelError';
  }
}

export class MissingApiKeyError extends Error {
  constructor(handle: string, url: string) {
    super(missingApiKeyMessage(handle, url));
    this.name = 'MissingApiKeyError';
  }
}

export function resolveModel(
  document: ProviderDocument,
  handle: string,
): ResolvedModel {
  void document;
  void handle;
  throw new Error('not implemented: resolveModel');
}
