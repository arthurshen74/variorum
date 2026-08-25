/**
 * The one-shot fold of legacy per-model bindings (`variorum.model.<name>`,
 * the design before the document) into the Models/Providers document
 * (DESIGN.md "Models and Providers", "First run and migration"). Runs
 * only when the document is absent; the legacy keys are removed once the
 * document is written.
 */
import type { ApiProtocol } from './protocols/adapter';
import type { ProviderDocument } from './provider-document';

export const LEGACY_BINDING_KEY_PREFIX = 'variorum.model.';

export interface LegacyBinding {
  api: ApiProtocol;
  endpointUrl: string;
  apiKey?: string;
  maxOutputTokens?: number;
}

/** Every parseable legacy record by model name; malformed records are skipped. */
export function readLegacyBindings(): Map<string, LegacyBinding> {
  throw new Error('not implemented: readLegacyBindings');
}

/** Pure: the seed with the legacy records folded in as endpoints and models. */
export function foldLegacyBindings(
  bindings: Map<string, LegacyBinding>,
  seed: ProviderDocument,
  newId: () => string,
): ProviderDocument {
  void bindings;
  void seed;
  void newId;
  throw new Error('not implemented: foldLegacyBindings');
}

export function removeLegacyBindings(): void {
  throw new Error('not implemented: removeLegacyBindings');
}
