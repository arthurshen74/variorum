/**
 * Model bindings (DESIGN.md "Model Bindings"): per-model device state in
 * localStorage under `variorum.model.<modelName>` — which endpoint a
 * model lives at, which wire protocol it speaks, the API key for it, and
 * (Anthropic Messages only) the mandatory output cap. Device state,
 * outside everything-in-IndexedDB: never in the Zustand store, never in
 * an export. When no binding is stored, the LM Studio default applies.
 * The legacy global keys (`variorum.baseUrl`, `variorum.apiKey`) are
 * dead: ignored if present, never migrated, never written.
 */

export type ApiProtocol = 'openai-compatible' | 'anthropic-messages';

export interface ModelBinding {
  api: ApiProtocol;
  endpointUrl: string;
  apiKey?: string;
  /** anthropic-messages only; absent means DEFAULT_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number;
}

// Exported so the Models view can show what Reset returns to.
export const DEFAULT_BASE_URL = 'http://localhost:1234/v1'; // LM Studio default

export const DEFAULT_BINDING: ModelBinding = {
  api: 'openai-compatible',
  endpointUrl: DEFAULT_BASE_URL,
};

export const DEFAULT_MAX_OUTPUT_TOKENS = 32000;

/** Boundary guard for stored JSON: a valid ModelBinding, or null. */
export function parseModelBinding(raw: string): ModelBinding | null {
  void raw;
  throw new Error('not implemented: parseModelBinding');
}

/** The stored binding, or DEFAULT_BINDING when absent or malformed. */
export function getModelBinding(modelName: string): ModelBinding {
  void modelName;
  throw new Error('not implemented: getModelBinding');
}

/** Whether a stored record exists (the Models view's stored-vs-default display). */
export function hasStoredBinding(modelName: string): boolean {
  void modelName;
  throw new Error('not implemented: hasStoredBinding');
}

export function setModelBinding(modelName: string, binding: ModelBinding): void {
  void modelName;
  void binding;
  throw new Error('not implemented: setModelBinding');
}

/** Reset: remove the record so the default shows through. */
export function clearModelBinding(modelName: string): void {
  void modelName;
  throw new Error('not implemented: clearModelBinding');
}

/** Boundary validation: trimmed, parseable, http(s)-schemed URL — or null. */
export function parseEndpointUrl(input: string): string | null {
  void input;
  throw new Error('not implemented: parseEndpointUrl');
}

/** Boundary normalization: the trimmed key, or null when empty/whitespace-only. */
export function normalizeApiKey(input: string): string | null {
  void input;
  throw new Error('not implemented: normalizeApiKey');
}
