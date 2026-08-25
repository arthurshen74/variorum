/**
 * Pure mutations of the Models/Providers document (DESIGN.md "Models and
 * Providers"): document in, result out, never mutating the input. Each
 * enforces the uniqueness and deletion rules and refuses with a message
 * the form shows. An unknown endpoint id or handle is an internal error
 * and throws.
 */
import type { ApiProtocol } from './protocols/adapter';
import type { Endpoint, ModelRow, ProviderDocument } from './provider-document';

export interface EndpointInput {
  url: string;
  api: ApiProtocol;
  authRequired: boolean;
  apiKey?: string;
}

export interface ModelInput {
  modelName: string;
  handle: string;
  apiKey?: string;
  maxOutputTokens?: number;
}

export type MutationResult =
  | { ok: true; document: ProviderDocument }
  | { ok: false; message: string };

export const ENDPOINT_EXISTS_MESSAGE =
  'An endpoint with this URL and protocol already exists.';
export const ENDPOINT_HAS_MODELS_MESSAGE =
  'This endpoint still has models; move or delete them first.';
export const HANDLE_EXISTS_MESSAGE = 'A model with this handle already exists.';
export const MODEL_EXISTS_ON_ENDPOINT_MESSAGE =
  'This endpoint already serves a model with this name.';

function requireEndpoint(document: ProviderDocument, id: string): Endpoint {
  const endpoint = document.endpoints.find((candidate) => candidate.id === id);
  if (endpoint === undefined) {
    throw new Error(`unknown endpoint id: ${id}`);
  }
  return endpoint;
}

/** The endpoint serving the handle, with the row itself. */
function requireModel(
  document: ProviderDocument,
  handle: string,
): { endpoint: Endpoint; model: ModelRow } {
  for (const endpoint of document.endpoints) {
    const model = endpoint.models.find(
      (candidate) => candidate.handle === handle,
    );
    if (model !== undefined) return { endpoint, model };
  }
  throw new Error(`unknown model handle: ${handle}`);
}

function pairTaken(
  document: ProviderDocument,
  input: EndpointInput,
  exceptId: string | null,
): boolean {
  return document.endpoints.some(
    (endpoint) =>
      endpoint.id !== exceptId &&
      endpoint.url === input.url &&
      endpoint.api === input.api,
  );
}

function handleTaken(
  document: ProviderDocument,
  handle: string,
  exceptHandle: string | null,
): boolean {
  return document.endpoints.some((endpoint) =>
    endpoint.models.some(
      (model) => model.handle !== exceptHandle && model.handle === handle,
    ),
  );
}

function modelNameTaken(
  endpoint: Endpoint,
  modelName: string,
  exceptHandle: string | null,
): boolean {
  return endpoint.models.some(
    (model) => model.handle !== exceptHandle && model.modelName === modelName,
  );
}

function endpointRow(input: EndpointInput, id: string, models: ModelRow[]) {
  return {
    id,
    url: input.url,
    api: input.api,
    authRequired: input.authRequired,
    ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
    models,
  };
}

function modelRow(input: ModelInput): ModelRow {
  return {
    modelName: input.modelName,
    handle: input.handle,
    ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
    ...(input.maxOutputTokens !== undefined
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
  };
}

/** Replaces the models of one endpoint, leaving every other endpoint identical. */
function withModels(
  document: ProviderDocument,
  endpointId: string,
  models: (endpoint: Endpoint) => ModelRow[],
): ProviderDocument {
  return {
    endpoints: document.endpoints.map((endpoint) =>
      endpoint.id === endpointId
        ? { ...endpoint, models: models(endpoint) }
        : endpoint,
    ),
  };
}

export function addEndpoint(
  document: ProviderDocument,
  input: EndpointInput,
  id: string,
): MutationResult {
  if (pairTaken(document, input, null)) {
    return { ok: false, message: ENDPOINT_EXISTS_MESSAGE };
  }
  return {
    ok: true,
    document: {
      endpoints: [...document.endpoints, endpointRow(input, id, [])],
    },
  };
}

export function updateEndpoint(
  document: ProviderDocument,
  id: string,
  input: EndpointInput,
): MutationResult {
  const existing = requireEndpoint(document, id);
  if (pairTaken(document, input, id)) {
    return { ok: false, message: ENDPOINT_EXISTS_MESSAGE };
  }
  return {
    ok: true,
    document: {
      endpoints: document.endpoints.map((endpoint) =>
        endpoint.id === id ? endpointRow(input, id, existing.models) : endpoint,
      ),
    },
  };
}

export function deleteEndpoint(
  document: ProviderDocument,
  id: string,
): MutationResult {
  const existing = requireEndpoint(document, id);
  if (existing.models.length > 0) {
    return { ok: false, message: ENDPOINT_HAS_MODELS_MESSAGE };
  }
  return {
    ok: true,
    document: {
      endpoints: document.endpoints.filter((endpoint) => endpoint.id !== id),
    },
  };
}

export function addModel(
  document: ProviderDocument,
  endpointId: string,
  input: ModelInput,
): MutationResult {
  const endpoint = requireEndpoint(document, endpointId);
  if (handleTaken(document, input.handle, null)) {
    return { ok: false, message: HANDLE_EXISTS_MESSAGE };
  }
  if (modelNameTaken(endpoint, input.modelName, null)) {
    return { ok: false, message: MODEL_EXISTS_ON_ENDPOINT_MESSAGE };
  }
  return {
    ok: true,
    document: withModels(document, endpointId, (target) => [
      ...target.models,
      modelRow(input),
    ]),
  };
}

export function updateModel(
  document: ProviderDocument,
  handle: string,
  input: ModelInput,
): MutationResult {
  const { endpoint } = requireModel(document, handle);
  if (handleTaken(document, input.handle, handle)) {
    return { ok: false, message: HANDLE_EXISTS_MESSAGE };
  }
  if (modelNameTaken(endpoint, input.modelName, handle)) {
    return { ok: false, message: MODEL_EXISTS_ON_ENDPOINT_MESSAGE };
  }
  return {
    ok: true,
    document: withModels(document, endpoint.id, (target) =>
      target.models.map((model) =>
        model.handle === handle ? modelRow(input) : model,
      ),
    ),
  };
}

export function deleteModel(
  document: ProviderDocument,
  handle: string,
): ProviderDocument {
  const { endpoint } = requireModel(document, handle);
  return withModels(document, endpoint.id, (target) =>
    target.models.filter((model) => model.handle !== handle),
  );
}

export function reassignModel(
  document: ProviderDocument,
  handle: string,
  targetEndpointId: string,
): MutationResult {
  const { endpoint, model } = requireModel(document, handle);
  const target = requireEndpoint(document, targetEndpointId);
  if (target.id === endpoint.id) return { ok: true, document };
  if (modelNameTaken(target, model.modelName, null)) {
    return { ok: false, message: MODEL_EXISTS_ON_ENDPOINT_MESSAGE };
  }
  return {
    ok: true,
    document: {
      endpoints: document.endpoints.map((candidate) => {
        if (candidate.id === endpoint.id) {
          return {
            ...candidate,
            models: candidate.models.filter((row) => row.handle !== handle),
          };
        }
        if (candidate.id === target.id) {
          return { ...candidate, models: [...candidate.models, model] };
        }
        return candidate;
      }),
    },
  };
}
