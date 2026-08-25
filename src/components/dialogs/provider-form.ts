/**
 * Pure helpers for the Models/Providers view (DESIGN.md "Management UI",
 * "Models and Providers"): drafts for the endpoint and model forms, the
 * boundary between raw field text and a mutation input, the tree's
 * labels and flags, and the "referenced, not bound" hint list. No IO —
 * the view owns document access through the provider modules.
 */
import type { Configuration, ConfigurationVersion } from '@/domain/types';
import type { ApiProtocol } from '@/llm/protocols/adapter';
import type {
  Endpoint,
  ModelRow,
  ProviderDocument,
} from '@/llm/provider-document';
import type { EndpointInput, ModelInput } from '@/llm/provider-mutations';

export interface EndpointDraft {
  url: string;
  api: ApiProtocol;
  authRequired: boolean;
  /** Raw field text; empty means no key. */
  apiKey: string;
}

export interface ModelDraft {
  modelName: string;
  /** Raw field text; blank means "same as modelName". */
  handle: string;
  /** Raw field text; empty means no key. */
  apiKey: string;
  /** Raw field text; blank means use the adapter's default. */
  maxOutputTokens: string;
}

export type DraftResult<T> =
  { ok: true; input: T } | { ok: false; message: string };

export function blankEndpointDraft(): EndpointDraft {
  throw new Error('not implemented: blankEndpointDraft');
}

export function endpointDraftFrom(endpoint: Endpoint): EndpointDraft {
  void endpoint;
  throw new Error('not implemented: endpointDraftFrom');
}

export function parseEndpointDraft(
  draft: EndpointDraft,
): DraftResult<EndpointInput> {
  void draft;
  throw new Error('not implemented: parseEndpointDraft');
}

/** A fresh model draft; the prefill seeds both modelName and handle. */
export function blankModelDraft(prefillName?: string): ModelDraft {
  void prefillName;
  throw new Error('not implemented: blankModelDraft');
}

export function modelDraftFrom(row: ModelRow): ModelDraft {
  void row;
  throw new Error('not implemented: modelDraftFrom');
}

/** The endpoint decides which fields count: key only when auth is required, cap only when its adapter declares it. */
export function parseModelDraft(
  draft: ModelDraft,
  endpoint: Endpoint,
): DraftResult<ModelInput> {
  void draft;
  void endpoint;
  throw new Error('not implemented: parseModelDraft');
}

/** `<url> (<adapter label>)` */
export function endpointLabel(endpoint: Endpoint): string {
  void endpoint;
  throw new Error('not implemented: endpointLabel');
}

/** True when the endpoint requires auth and neither row holds a key. */
export function hasKeyGap(endpoint: Endpoint, row: ModelRow): boolean {
  void endpoint;
  void row;
  throw new Error('not implemented: hasKeyGap');
}

/**
 * Handles named by the LATEST saved version of any configuration,
 * archived included, that no model row carries — sorted.
 */
export function referencedUnboundHandles(
  configurations: Configuration[],
  versions: ConfigurationVersion[],
  document: ProviderDocument,
): string[] {
  void configurations;
  void versions;
  void document;
  throw new Error('not implemented: referencedUnboundHandles');
}
