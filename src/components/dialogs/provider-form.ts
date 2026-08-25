/**
 * Pure helpers for the Models/Providers view (DESIGN.md "Management UI",
 * "Models and Providers"): drafts for the endpoint and model forms, the
 * boundary between raw field text and a mutation input, the tree's
 * labels and flags, and the "referenced, not bound" hint list. No IO —
 * the view owns document access through the provider modules.
 */
import type { Configuration, ConfigurationVersion } from '@/domain/types';
import type { ApiProtocol } from '@/llm/protocols/adapter';
import {
  DEFAULT_ENDPOINT_PROTOCOL,
  protocolAdapter,
} from '@/llm/protocols/registry';
import {
  normalizeApiKey,
  parseEndpointUrl,
  type Endpoint,
  type ModelRow,
  type ProviderDocument,
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

export const ENDPOINT_URL_MESSAGE = 'Enter a parseable http or https URL.';
export const MODEL_NAME_MESSAGE = 'Enter a model name.';
export const MAX_OUTPUT_TOKENS_MESSAGE = 'Max output tokens must be a number.';

export function blankEndpointDraft(): EndpointDraft {
  return {
    url: '',
    api: DEFAULT_ENDPOINT_PROTOCOL,
    authRequired: false,
    apiKey: '',
  };
}

export function endpointDraftFrom(endpoint: Endpoint): EndpointDraft {
  return {
    url: endpoint.url,
    api: endpoint.api,
    authRequired: endpoint.authRequired,
    apiKey: endpoint.apiKey ?? '',
  };
}

export function parseEndpointDraft(
  draft: EndpointDraft,
): DraftResult<EndpointInput> {
  const url = parseEndpointUrl(draft.url);
  if (url === null) return { ok: false, message: ENDPOINT_URL_MESSAGE };

  // A key typed before authentication was unchecked is dropped, not stored:
  // the endpoint sends none, so it must hold none.
  const apiKey = draft.authRequired ? normalizeApiKey(draft.apiKey) : null;

  return {
    ok: true,
    input: {
      url,
      api: draft.api,
      authRequired: draft.authRequired,
      ...(apiKey !== null ? { apiKey } : {}),
    },
  };
}

/** A fresh model draft; the prefill seeds both modelName and handle. */
export function blankModelDraft(prefillName?: string): ModelDraft {
  return {
    modelName: prefillName ?? '',
    handle: prefillName ?? '',
    apiKey: '',
    maxOutputTokens: '',
  };
}

export function modelDraftFrom(row: ModelRow): ModelDraft {
  return {
    modelName: row.modelName,
    handle: row.handle,
    apiKey: row.apiKey ?? '',
    maxOutputTokens:
      row.maxOutputTokens === undefined ? '' : String(row.maxOutputTokens),
  };
}

/** The endpoint decides which fields count: key only when auth is required, cap only when its adapter declares it. */
export function parseModelDraft(
  draft: ModelDraft,
  endpoint: Endpoint,
): DraftResult<ModelInput> {
  const modelName = draft.modelName.trim();
  if (modelName === '') return { ok: false, message: MODEL_NAME_MESSAGE };
  const handle = draft.handle.trim() === '' ? modelName : draft.handle.trim();

  const apiKey = endpoint.authRequired ? normalizeApiKey(draft.apiKey) : null;

  // Parsed only under an adapter that carries the cap, so field text
  // stranded by a move to another endpoint never blocks a save.
  let maxOutputTokens: number | undefined;
  if (protocolAdapter(endpoint.api).usesMaxOutputTokens) {
    const cap = draft.maxOutputTokens.trim();
    if (cap !== '') {
      const parsed = Number(cap);
      if (!Number.isFinite(parsed)) {
        return { ok: false, message: MAX_OUTPUT_TOKENS_MESSAGE };
      }
      maxOutputTokens = parsed;
    }
  }

  return {
    ok: true,
    input: {
      modelName,
      handle,
      ...(apiKey !== null ? { apiKey } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    },
  };
}

/** `<url> (<adapter label>)` */
export function endpointLabel(endpoint: Endpoint): string {
  return `${endpoint.url} (${protocolAdapter(endpoint.api).label})`;
}

/** True when the endpoint requires auth and neither row holds a key. */
export function hasKeyGap(endpoint: Endpoint, row: ModelRow): boolean {
  return (
    endpoint.authRequired &&
    row.apiKey === undefined &&
    endpoint.apiKey === undefined
  );
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
  const latest = new Map<string, ConfigurationVersion>();
  for (const version of versions) {
    const best = latest.get(version.name);
    if (best === undefined || version.version > best.version) {
      latest.set(version.name, version);
    }
  }

  const bound = new Set(
    document.endpoints.flatMap((endpoint) =>
      endpoint.models.map((model) => model.handle),
    ),
  );

  const referenced = new Set<string>();
  for (const configuration of configurations) {
    const version = latest.get(configuration.name);
    if (version !== undefined && !bound.has(version.modelName)) {
      referenced.add(version.modelName);
    }
  }
  return [...referenced].sort();
}
