/**
 * Pure mutations of the Models/Providers document (DESIGN.md "Models and
 * Providers"): document in, result out, never mutating the input. Each
 * enforces the uniqueness and deletion rules and refuses with a message
 * the form shows. An unknown endpoint id or handle is an internal error
 * and throws.
 */
import type { ApiProtocol } from './protocols/adapter';
import type { ProviderDocument } from './provider-document';

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
  { ok: true; document: ProviderDocument } | { ok: false; message: string };

export const ENDPOINT_EXISTS_MESSAGE =
  'An endpoint with this URL and protocol already exists.';
export const ENDPOINT_HAS_MODELS_MESSAGE =
  'This endpoint still has models; move or delete them first.';
export const HANDLE_EXISTS_MESSAGE = 'A model with this handle already exists.';
export const MODEL_EXISTS_ON_ENDPOINT_MESSAGE =
  'This endpoint already serves a model with this name.';

export function addEndpoint(
  document: ProviderDocument,
  input: EndpointInput,
  id: string,
): MutationResult {
  void document;
  void input;
  void id;
  throw new Error('not implemented: addEndpoint');
}

export function updateEndpoint(
  document: ProviderDocument,
  id: string,
  input: EndpointInput,
): MutationResult {
  void document;
  void id;
  void input;
  throw new Error('not implemented: updateEndpoint');
}

export function deleteEndpoint(
  document: ProviderDocument,
  id: string,
): MutationResult {
  void document;
  void id;
  throw new Error('not implemented: deleteEndpoint');
}

export function addModel(
  document: ProviderDocument,
  endpointId: string,
  input: ModelInput,
): MutationResult {
  void document;
  void endpointId;
  void input;
  throw new Error('not implemented: addModel');
}

export function updateModel(
  document: ProviderDocument,
  handle: string,
  input: ModelInput,
): MutationResult {
  void document;
  void handle;
  void input;
  throw new Error('not implemented: updateModel');
}

export function deleteModel(
  document: ProviderDocument,
  handle: string,
): ProviderDocument {
  void document;
  void handle;
  throw new Error('not implemented: deleteModel');
}

export function reassignModel(
  document: ProviderDocument,
  handle: string,
  targetEndpointId: string,
): MutationResult {
  void document;
  void handle;
  void targetEndpointId;
  throw new Error('not implemented: reassignModel');
}
